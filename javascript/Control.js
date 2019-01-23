L.Control.StyleEditor = L.Control.extend({
    options: {
        position: 'topleft',
        enabled: false,

        colorRamp: ['#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#34495e', '#16a085', '#27ae60', '#2980b9', '#8e44ad',
                    '#2c3e50', '#f1c40f', '#e67e22', '#e74c3c', '#ecf0f1', '#95a5a6', '#f39c12', '#d35400', '#c0392b',
                    '#bdc3c7', '#7f8c8d'],
        defaultColor: null,

        markerType: L.StyleEditor.marker.DefaultMarker,
        markers: null,
        defaultMarkerIcon: null,
        defaultMarkerColor: null,

        geometryForm: L.StyleEditor.forms.GeometryForm,
		flowForm:L.StyleEditor.forms.FlowForm,
		
        openOnLeafletDraw: true,
        showTooltip: true,

        strings: {
            cancel: 'Cancel',
            cancelTitle: 'Cancel Styling',
            tooltip: 'Click on the element you want to style',
            tooltipNext: 'Choose another element you want to style'
        },
        useGrouping: true,


        // internal
        currentElement: null,
        _editLayers: [],
        _layerGroups: []

    },

    initialize: function(options) {
        if (!!options) {
            L.setOptions(this, options);
        }

        this.options.util = new L.StyleEditor.Util({styleEditorOptions: this.options});
        this.options.markerType = new this.options.markerType({styleEditorOptions: this.options});
        this.options.markerForm = new this.options.markerType.markerForm({styleEditorOptions: this.options});
        this.options.geometryForm = new this.options.geometryForm({styleEditorOptions: this.options});
		this.options.flowForm = new this.options.flowForm({styleEditorOptions: this.options});

        this.getDefaultIcon = this.options.markerType._createMarkerIcon.bind(this.options.markerType),
        this.createIcon = this.options.markerType.createMarkerIcon.bind(this.options.markerType)
    },

    onAdd: function(map) {
        this.options.map = map;
        return this.createUi();
    },

    createUi: function() {
        var controlDiv = this.options.controlDiv = L.DomUtil.create('div', 'leaflet-control-styleeditor leaflet-control leaflet-bar');
        var controlUI = this.options.controlUI = L.DomUtil.create('a', 'leaflet-control-styleeditor-interior',
            controlDiv);
        controlUI.title = 'Style Editor';

        var cancel = this.options.cancelUI = L.DomUtil.create('div', 'leaflet-control-styleeditor-cancel leaflet-styleeditor-hidden', controlDiv);
        cancel.innerHTML = this.options.strings.cancel;
        cancel.title = this.options.strings.cancelTitle;

        var styleEditorDiv = this.options.styleEditorDiv =
            L.DomUtil.create('div', 'leaflet-styleeditor', this.options.map._container);
        this.options.styleEditorHeader = L.DomUtil.create('div', 'leaflet-styleeditor-header', styleEditorDiv);
        var styleEditorInterior = L.DomUtil.create('div', 'leaflet-styleeditor-interior', styleEditorDiv);

        this.addDomEvents();
        this.addLeafletDrawEvents();
        this.addButtons();

        this.options.styleForm = new L.StyleForm({
            styleEditorDiv: styleEditorDiv,
            styleEditorInterior: styleEditorInterior,
            styleEditorOptions: this.options
        });

        return controlDiv;
    },

    addDomEvents: function() {
        L.DomEvent.addListener(this.options.controlDiv, 'click', function(e) {
            this.enable(); e.stopPropagation();
        }, this);
        L.DomEvent.addListener(this.options.cancelUI, 'click', function(e) {
            this.disable(); e.stopPropagation();
        }, this);
        L.DomEvent.addListener(this.options.controlDiv, 'dblclick', function(e) { e.stopPropagation(); }, this);
        L.DomEvent.addListener(this.options.styleEditorDiv, 'click', L.DomEvent.stopPropagation);
        L.DomEvent.addListener(this.options.styleEditorDiv, 'mouseenter', this.disableLeafletActions, this);
        L.DomEvent.addListener(this.options.styleEditorDiv, 'mouseleave', this.enableLeafletActions, this);
    },

    addLeafletDrawEvents: function() {
        if (!this.options.openOnLeafletDraw) {
          return;
        }
        if (!L.Control.Draw) {
          return;
        }

        this.options.map.on('layeradd', function(e) {
            if (this.options.currentElement) {
                if (e.layer === this.options.currentElement.target) {
                    this.enable();
                    this.initChangeStyle({
                        "target": e.layer
                    });
                }
            }
        }, this);

        this.options.map.on(L.Draw.Event.CREATED, function(layer) {
            this.removeIndicators();
            this.options.currentElement = {'target': layer.layer};
        }, this);
    },

    addButtons: function() {
        var nextBtn = L.DomUtil.create('button',
            'leaflet-styleeditor-button styleeditor-nextBtn', this.options.styleEditorHeader);
        nextBtn.title = this.options.strings.tooltipNext;

        L.DomEvent.addListener(nextBtn, 'click', function(e) {
          this.hideEditor();

          if (L.DomUtil.hasClass(this.options.controlUI, 'enabled'))
              this.createTooltip();

          e.stopPropagation();
        }, this);
    },

    disableLeafletActions: function() {
      var m = this.options.map;

        m.dragging.disable();
        m.touchZoom.disable();
        m.doubleClickZoom.disable();
        m.scrollWheelZoom.disable();
        m.boxZoom.disable();
        m.keyboard.disable();
    },

    enableLeafletActions: function() {
      var m = this.options.map;

        m.dragging.enable();
        m.touchZoom.enable();
        m.doubleClickZoom.enable();
        m.scrollWheelZoom.enable();
        m.boxZoom.enable();
        m.keyboard.enable();
    },

    enable: function() {
        L.DomUtil.addClass(this.options.controlUI, "enabled");
        this.options.map.eachLayer(this.addEditClickEvents, this);
        this.showCancelButton();
        this.createTooltip();
    },

    disable: function() {
        this.options._editLayers.forEach(this.removeEditClickEvents, this);
        this.options._editLayers = [];
        this.options._layerGroups = [];
        this.hideEditor();
        this.hideCancelButton();
        this.removeTooltip();
    },

    addEditClickEvents: function(layer) {
      if (this.options.useGrouping && layer instanceof L.LayerGroup) {
        this.options._layerGroups.push(layer);
      } else if (layer instanceof L.Marker || layer instanceof L.Path) {
            var evt = layer.on('click', this.initChangeStyle, this);
/*            var evtB = layer.on('mouseover', this.initChangeStyle, this);
            var evtC = layer.on('mouseoout', this.initChangeStyle, this)*/
            this.options._editLayers.push(evt);
        }
    },

    removeEditClickEvents: function(layer) {
        layer.off('click', this.initChangeStyle, this);
    },

    addIndicators: function() {
        if(!this.options.currentElement) {
            return;
        }

        var currentElement = this.options.currentElement.target;
        if (currentElement instanceof L.LayerGroup) {
            currentElement.eachLayer(function(layer) {
                if(layer instanceof L.Marker && layer.getElement()) {
                    L.DomUtil.addClass(layer.getElement(), 'leaflet-styleeditor-marker-selected');
                }
            });
        } else if (currentElement instanceof L.Marker) {
            if (currentElement.getElement()) {
                L.DomUtil.addClass(currentElement.getElement(), 'leaflet-styleeditor-marker-selected');
            }
        }
    },

    removeIndicators: function() {
        if (!this.options.currentElement) {
            return;
        }
        var currentElement = this.options.currentElement.target;
        if (currentElement._map&&this._markerGroup) {
			currentElement._map.removeLayer(this._markerGroup);
			delete this._markerGroup;
        }
        if (currentElement instanceof L.LayerGroup) {
            currentElement.eachLayer(function(layer) {
                if(layer.getElement()) {
                    L.DomUtil.removeClass(layer.getElement(), 'leaflet-styleeditor-marker-selected');
                }
            });
        } else {
            if(currentElement.getElement()) {
                L.DomUtil.removeClass(currentElement.getElement(), 'leaflet-styleeditor-marker-selected');
            }
        }
        
    },

    hideEditor: function() {
        this.removeIndicators();
        L.DomUtil.removeClass(this.options.styleEditorDiv, 'editor-enabled');
    },

    hideCancelButton: function() {
        L.DomUtil.addClass(this.options.cancelUI, 'leaflet-styleeditor-hidden');
    },

    showEditor: function() {
        var editorDiv = this.options.styleEditorDiv;
        if (!L.DomUtil.hasClass(editorDiv, 'editor-enabled')) {
            L.DomUtil.addClass(editorDiv, 'editor-enabled');
            //alter("its'here");
        }
    },

    showCancelButton: function() {
        L.DomUtil.removeClass(this.options.cancelUI, 'leaflet-styleeditor-hidden');
    },

    initChangeStyle: function(e) {
        this.removeIndicators();
        this.options.currentElement = (this.options.useGrouping) ? this.getMatchingElement(e) : e;

        this.addIndicators();
        this.showEditor();
        this.removeTooltip();
		if (!this._markerGroup) {
			this._markerGroup = new L.LayerGroup();
		}
        var layer = e.target;
        if (layer instanceof L.Marker) {
            // ensure iconOptions are set for Leaflet.Draw created Markers
            this.options.markerType.resetIconOptions();
            // marker
            this.showMarkerForm();
        } else if (layer instanceof L.MigrationLayer){
        	this.showFlowForm();
        }
        else {
            // layer with of type L.GeoJSON or L.Path (polyline, polygon, ...)
            this.showGeometryForm();
            if (layer instanceof L.CircleMarker){
            	var marker = new L.Marker.Touch(layer.getLatLng(), {
				draggable: false,
				icon: new L.DivIcon({
										iconSize: new L.Point(8, 8),
										className: 'leaflet-div-icon leaflet-editing-icon leaflet-edit-move leaflet-touch-icon'
				}),
				zIndexOffset: 10
		});
			this._markerGroup.addLayer(marker);
			layer._map.addLayer(this._markerGroup);
            }else if (layer instanceof L.MigrationLayer){
            	return;
            }else{
            var bounds=layer.getBounds();
            var rec = new L.Rectangle(bounds, {color: "#FF3300", weight: 1,fillOpacity:0.1,dashArray: '1,6'});
			this._markerGroup.addLayer(rec);
			layer._map.addLayer(this._markerGroup);
            }

        }

    },

    showGeometryForm: function() {
        this.options.styleForm.showGeometryForm();
    },

    showFlowForm: function() {
        this.options.styleForm.showFlowForm();
    },

    showMarkerForm: function() {
        this.options.styleForm.showMarkerForm();
    },

    createTooltip: function() {
        if (!this.options.showTooltip) {
          return;
        }

        if (!this.options.tooltipWrapper) {
            this.options.tooltipWrapper =
             L.DomUtil.create('div', 'leaflet-styleeditor-tooltip-wrapper', this.options.map.getContainer());
        }

        if (!this.options.tooltip) {
            this.options.tooltip = L.DomUtil.create('div', 'leaflet-styleeditor-tooltip', this.options.tooltipWrapper);
        }

        this.options.tooltip.innerHTML = this.options.strings.tooltip;
    },

    getMatchingElement: function(e) {
      var group = null,
        layer = e.target;

        for (var i = 0; i < this.options._layerGroups.length; ++i) {
          group = this.options._layerGroups[i];
          if (group && layer !== group && group.hasLayer(layer)) {
            // we use the opacity style to check for correct object
            if (!group.options || !group.options.opacity) {
              group.options = layer.options;

              // special handling for layers... we pass the setIcon function
              if (layer.setIcon) {
                group.setIcon = function(icon) {
                  group.eachLayer(function(layer) {
                    if (layer instanceof L.Marker) {
                      layer.setIcon(icon);
                    }
                  });
                };
              }
            }

            return this.getMatchingElement({
              target: group
            });
          }
        }

        return e;
    },

    removeTooltip: function() {
        if (this.options.tooltip && this.options.tooltip.parentNode) {
            this.options.tooltip.remove();
            this.options.tooltip = undefined;
        }
    },

});

L.control.styleEditor = function(options) {
    return new L.Control.StyleEditor(options);
};
