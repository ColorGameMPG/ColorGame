define([
	'utils',
	'ColorParse',
	'jquery',
	'backbone'

], function (Utils, ColorParse) {
	return Backbone.View.extend({
		NAME: 'LiveReceiverSymbolView',

		initialize : function(options) {
			this.colorsapp = options.colorsapp;
			this.allSymbols = options.allSymbols;
		},

		render : function() {
			this.$el.html(this.colorsapp.template("LiveReceiverSymbolViewTemplate"));
			this.updateMessage();
		},
		
		updateMessage: function() {
			var count = this.$el.find(".receiverSymbol:not(.hidden)").length;
			var message = count > 0 ? 'label_select_color' : 'livesession_waiting_text';
			this.$el.find(".receiverSymbolMessage").text(Utils.tr(message));
		},

		assignIndex: function(symbol, index) {
			symbol.data('symbol-index', index);
			symbol.find('img').attr('src', this.allSymbols[index].get('image_path').url());
		},

		setSymbols: function(symbolIndices) {
			var self = this;

			var template = self.$el.find(".receiverSymbol.hidden").first();
			var existing = self.$el.find(".receiverSymbol:not(.hidden)");

			var i = 0;
			for (; i < symbolIndices.length; i++) {
				var symbol = $(existing.get(i));
				var index = symbolIndices[i];
				if (symbol.length == 0) {
					// Add new symbol
					var symbol = template.clone()
						.toggleClass('hidden')
						.appendTo(template.parent());
					symbol.css({"width" : self.colorsapp.ui.oneDesignUnit + "px", "height" : self.colorsapp.ui.oneDesignUnit + "px"});
					self.assignIndex(symbol, index);
				} else if (symbol.data('symbol-index') != index) {
					// Update existing symbol
					self.assignIndex(symbol, index);
				}
			}

			for (; i < existing.length; i++) {
				// Remove extra symbol
				$(existing.get(i)).remove();
			}

			this.updateMessage();
		}
	});
});
