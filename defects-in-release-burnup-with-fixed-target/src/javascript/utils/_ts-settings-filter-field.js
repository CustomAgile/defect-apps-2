/**
 *
 */
Ext.define('Rally.techservices.SettingsFilterField', {
    extend: 'Ext.form.field.Base',
    alias: 'widget.tssettingsfilterfield',

    fieldSubTpl: '<div id="{id}" class="settings-grid"></div>',

    config: {
        value: undefined, // a string for the filter
        model: 'Defect'
    },

    onDestroy: function() {
        if (this._filter_group) {
            this._filter_group.destroy();
            delete this._filter_group;
        }
        this.callParent(arguments);
    },

    onRender: function() {
        this.callParent(arguments);

        this._filter_group = Ext.create('Ext.container.Container',{
            renderTo: this.inputEl,
            layout: 'column',
            items: [
                { xtype:'container', itemId:'filter_property', width: 150},
                { xtype:'container', itemId:'filter_operator', width: 50},
                { xtype:'container', itemId:'filter_value', width: 150}
            ]
        });
        
        if ( Ext.isString(this.model) ) {
            this._getModel(this.model).then({
                scope: this,
                success: function(model) {
                    this.model = model;
                    this._addFilterFields(this._filter_group);
                },
                failure: function(msg) {
                    Ext.Msg.alert("Problem loading model for filter", msg);
                }
            });
        } else {
            this._addFilterFields(this._filter_group);
        }
        
        
    },
    
    _addFilterFields: function(container) {
        var value = this.filter && this.filter.property;
        
        this._filter_field = container.down('#filter_property').add({
            xtype: 'rallyfieldcombobox',
            model: this.model,
            value: value,
            allowNoEntry: true,
            _isNotHidden: function(field) {
                if ( field.hidden ) { return false; }
                var defn = field.attributeDefinition;
                if ( Ext.isEmpty(defn) ) { return false; }

                var valid_types = ['INTEGER','QUANTITY','DECIMAL','BOOLEAN', 'STRING'];
                return ( Ext.Array.contains(valid_types,defn.AttributeType) );
            },
            listeners: {
                scope: this,
                change: function(cb) {
                    if ( this._filter_operator ) { this._filter_operator.destroy(); }
                    if ( this._filter_value ) { this._filter_value.destroy(); }
                    
                    if ( !Ext.isEmpty(cb.getValue())) {
                        this.field = this.model.getField(cb.getValue());
                        this._add_operator_field(container);
                    } else {
                        this.filter = null;
                    }
                },
                ready: function(cb) {
                    if ( this._filter_operator ) { this._filter_operator.destroy(); }
                    if ( this._filter_value ) { this._filter_value.destroy(); }
                    
                    if ( !Ext.isEmpty(cb.getValue())) {
                        this.field = this.model.getField(cb.getValue());
                        this._add_operator_field(container);
                    } else {
                        this.filter = null;
                    }
                }
            }
        });
    },
    
    _add_operator_field: function(container) {
        var store = this.field.getAllowedQueryOperatorStore();
        store.load();

        var value = this.filter && this.filter.operator;

        this._filter_operator = container.down('#filter_operator').add({
            xtype: 'rallycombobox',
            itemId: 'operatorCombobox',
            value: value,
            autoLoad: false,
            editable: false,
            forceSelection: true,
            store: store,
            displayField: 'OperatorName',
            valueField: 'OperatorName',
            matchFieldWidth: true,
            listeners: {
                scope : this,
                change: this._createFilter,
                ready : this._addValueSelector
            }
        });
    },
    
    _addValueSelector: function() {
        var editor = {
            xtype: 'rallytextfield',
            disabled: true,
            autoLoad: false,
            editable: false,
            forceSelection: true,
            matchFieldWidth: true
        };
        
        var field_selector = this._filter_field;
        
        if ( !Ext.isEmpty(field_selector) ) {
            var field_name = field_selector.getValue();
            var field = this.model.getField(field_name);
            if ( ! Ext.isEmpty(field_name) ) {
                if ( field_name == "ScheduleState" ) {
                    editor = this._getScheduleStateEditor();
                } else {
                    editor = Rally.ui.renderer.GridEditorFactory.getEditor(field);
                }
            }
           
            if ( editor.xtype == "rallytextfield" ) {
                editor.height = 22;
            }
            
            if ( /editor/.test(editor.xtype) ) {
                editor = this._useModifiedEditor(editor,field);
            }
            
            editor.listeners = {
                scope : this,
                change: this._createFilter
            }
            
            if ( editor.xtype == 'rallycombobox' ) {
                editor.allowNoEntry = true;
            }
            
            editor.value = this.filter && this.filter.value;
            
            this._filter_value = this._filter_group.down('#filter_value').add(editor);
            
        }
    },
    
    _useModifiedEditor: function(editor, field) {
        var editor_config = editor.field;
        if ( editor_config.xtype == 'rallyfieldvaluecombobox' ) {
            editor_config.model = this.model.elementName;
            editor_config.field = field.name;
            editor_config.storeConfig.autoLoad = true;
        }
        
        if ( editor_config.xtype == 'rallyiterationcombobox'  || editor_config.xtype == 'rallyreleasecombobox') {
            editor_config.defaultToCurrentTimebox = true;
            delete editor_config.storeConfig;
        }
                
        return editor_config;
    },
    
    _getScheduleStateEditor: function() {
        return {
            xtype: 'rallyfieldvaluecombobox',
            model: this.model,
            field: 'ScheduleState'
        };
    },
    
    _createFilter: function() {
        var property = this._filter_field.getValue();
        var operator = this._filter_operator.getValue();
        if ( Ext.isEmpty(this._filter_value) ) { return; }
        var value    = this._filter_value.getValue();
        this.filter = { property: property, operator: operator, value: value };
    },
    
    /**
     * When a form asks for the data this field represents,
     * give it the name of this field and the ref of the selected project (or an empty string).
     * Used when persisting the value of this field.
     * @return {Object}
     */
    getSubmitData: function() {
        var data = {};
        var value = null;
        if ( !Ext.isEmpty(this.filter) ) {
            value = Ext.JSON.encode(this.filter);
        }
        data[this.name] = value;
        return data;
    },

    getErrors: function() {
        return [];
    },

    setValue: function(value) {
        this.callParent(arguments);
        this.filter = value;
        if ( !Ext.isEmpty(value) && Ext.isString(value) ) { this.filter = Ext.JSON.decode(value); }
    },
    
    _getModel: function(model_name) {
        var deferred = Ext.create('Deft.Deferred');
        
        Rally.data.ModelFactory.getModel({
            type: model_name,
            success: function(model) {
                deferred.resolve(model);
            },
            failure: function(msg) {
                deferred.reject(msg);
            }
        });
        return deferred.promise;
    }
});