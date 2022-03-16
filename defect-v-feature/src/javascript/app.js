Ext.define("TSDefectVsFeature", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout: 'hbox'},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "TSDefectVsFeature"
    },
    
    release: null,

    launch: function() {
        this._addSelectors(this.down('#selector_box'));
    },
    
    _addSelectors: function(container) {
        container.add({
            xtype:'rallyreleasecombobox',
            margin: 10,

            listeners: {
                scope: this,
                change: function(cb) {
                    this.release = cb.getRecord();
                    this._updateData();
                }
            }
        });
      
        var store = Ext.create('Rally.data.custom.Store',{
            xtype:'rallycustom',
            autoLoad: true,
            data: [
                { _refObjectName:'Size', _ref: 'size' },
                { _refObjectName:'Count',_ref: 'count'}
            ]
        });
                
        
        this.metric_selector = container.add({
            xtype:'rallycombobox',
            store: store,
            itemId: 'metric_selector',
            margin: 10,
            width: 100,
            stateful: true,
            stateId: 'techservices-timeline-metriccombo-1',
            stateEvents:['select','change'],
            listeners: {
                scope: this,
                change: this._updateData
            }
        });        
        container.add({xtype:'container',flex:1});
        
    },
    
    _updateData: function() {
        var me = this;
        this.down('#display_box').removeAll();
        if ( Ext.isEmpty(this.release) ) { return; }
        if ( Ext.isEmpty(this.metric_selector) ) { return; }
        
        this.setLoading('Gathering data...');
        Deft.Chain.pipeline([
            this._getIterations,
            this._getIterationItems,
            this._makeChart
        ],this).then({
            failure: function(msg) {
                Ext.Msg.alert('',msg);
            }
        }).always(function() { me.setLoading(false); }); 
    },
    
    _getIterations: function() {
        var deferred = Ext.create('Deft.Deferred');
        var release = this.release;
        
        var fetch = ['StartDate','Name','EndDate'];
        var target_field = this.getSetting('sprintTargetField');

        if ( !Ext.isEmpty(target_field) ) { fetch.push(target_field); }
        
        var end_date = new Date();
        if ( release.get('ReleaseDate') < end_date ) {
            end_date = release.get('ReleaseDate');
        }
        var filters = Rally.data.wsapi.Filter.and([
            {property:'StartDate',operator:'>=',value: release.get('ReleaseStartDate')},
            {property:'StartDate',operator:'<=',value: end_date},
            {property:'EndDate',operator:'<=',value: release.get('ReleaseDate')}
        ]);
        
        var config = {
            model:'Iteration',
            limit:Infinity,
            filters: filters,
            fetch: fetch,
            context: {
                projectScopeUp: false,
                projectScopeDown: false
            },
            sorters: [{property:'StartDate',direction:'ASC'}]
        };
        
        this._loadWsapiRecords(config).then({
            success: function(results) {
                this.iterations = results;
                deferred.resolve();
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred.promise;
    },
    
    _getIterationItems: function() {
        var me = this,
            deferred = Ext.create('Deft.Deferred');
        
        var promises = [];
        Ext.Array.each(this.iterations, function(iteration){
            promises.push(
                function() {
                    return me._getItemsForIteration(iteration);
                }
            );
        });
        
        Deft.Chain.sequence(promises,me).then({
            success: function(results) {
                var defect_series = this._getTypeSeries('defect',results);
                var story_series = this._getTypeSeries('hierarchicalrequirement',results);
                
                deferred.resolve([defect_series,story_series]);
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred.promise;
    },
    
    _getTypeSeries: function(type,item_sets) {
        var metric = this.metric_selector.getValue() || "size";
        var suffix = "SPs";
        if ( metric == "count" ) { suffix = "Count";}
        
        var names_by_type = {
            'hierarchicalrequirement': Ext.String.format('Feature {0}', suffix),
            'defect': Ext.String.format('Defect {0}', suffix),
        };
        
        
        return {
            name: names_by_type[type],
            data: Ext.Array.map(item_sets, function(item_set){
                var type_items = Ext.Array.filter(item_set, function(item) {
                    return ( type == item.get('_type') );
                });
                
                var size = 0;
                Ext.Array.each(type_items, function(item){
                    var item_size = item.get('PlanEstimate') || 0;
                    if ( metric == 'count' ) {
                        item_size = 1;
                    }
                    size += item_size;
                });
                return size;
            })
        };
    },
    
    _getItemsForIteration: function(iteration){
        var filters = [
            {property:'Iteration.Name',value:iteration.get('Name')}
        ];
        
        var config = {
            limit: Infinity,
            filters: filters,
            fetch: ['ObjectID','FormattedID','PlanEstimate']
        };
        
        return this._loadWsapiArtifactRecords(config);
    },
      
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
      
    _loadWsapiArtifactRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            models: ['Defect', 'DefectSuite', 'UserStory'],
            fetch: ['ObjectID']
        };
        var full_config = Ext.Object.merge(default_config,config);
        this.logger.log("Starting load:",full_config.models);
        Ext.create('Rally.data.wsapi.artifact.Store', full_config).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    _makeChart: function(series){
        console.log('series',series);
        
        this.setLoading("Calculating...");
        var container = this.down('#display_box');

        var categories = this._getCategories(this.iterations);

        if ( categories.length === 0 ) {
            container.add({xtype:'container',html:'No Iterations in Release'});
            return;
        }

        container.add({
            xtype: 'rallychart',
            chartData: { series: series, categories: categories },
            chartConfig: this._getChartConfig()
        });
        
        return;
    },
    
    _getCategories: function(iterations) {
        return Ext.Array.map(iterations, function(iteration) {
            return iteration.get('Name');
        });
    },
    
    _getChartConfig: function() {

        return {
            chart: {
                type: 'column',
                zoomType: 'xy'
            },
            title: {
                text: 'Defect vs. Feature Allocation'
            },
            xAxis: {
                tickmarkPlacement: 'on',
                title: {
                    text: 'Sprint'
                },
                labels            : {
                    rotation : -45
                }
            },
            yAxis: [
                {
                    min: 0,
                    title: {
                        text: ' '
                    },
                    opposite: false
                }
            ],
            tooltip: { shared: true },
            plotOptions: {
                series: {
                    marker: {
                        enabled: false
                    }
                },
                column: {
                    stacking: 'percent'
                }
            }
        };
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
