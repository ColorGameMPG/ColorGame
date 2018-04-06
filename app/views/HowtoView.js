define([
	'ColorParse',
	'utils',
	'jquery',
	'backbone'

], function (ColorParse, Utils) {
	return Backbone.View.extend({
		NAME: 'HowtoView',

		initialize : function(options) {
			this.colorsapp = options.colorsapp;
		},
		render : function() {
			var self = this;
			this.$el.html(this.colorsapp.template("HowtoViewTemplate"));
		}
	});
});