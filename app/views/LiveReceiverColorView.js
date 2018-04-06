define([
	'ColorParse',
	'utils',
	'jquery',
	'backbone'

], function (ColorParse, Utils) {
	return Backbone.View.extend({
		NAME: 'LiveReceiverColorView',

		initialize : function(options) {
			this.colorsapp = options.colorsapp;
			this.eventbus = options.eventbus;
			this.colors = options.colors;
		},

		render : function() {
			var self = this;
			self.setElement(self.colorsapp.template("LiveReceiverColorViewTemplate", {
				colors: self.colors
			}));
			
			var colorButtons = self.$el.find('.receiverColor');
			
			colorButtons.on('click', function(){
				colorButtons.off("click");

				Utils.sound.playSound("color");
				
				var thisEl = $(this);
				colorButtons.not(thisEl).removeClass('selected');
				thisEl.toggleClass('selected');
				
				self.eventbus.trigger('receiver_color_chosen', thisEl.data('color'));
			});

			colorButtons.hide();
			
		},
		symbolsArrived : function(symbols) {
			if (symbols.length > 0) {
				this.$el.find(".receiverColor").show();
			}
		}
	});
});
