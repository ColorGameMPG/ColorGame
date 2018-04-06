define([
    'utils',
    'ColorParse',
    'jquery',
    'backbone'

], function (Utils, ColorParse) {
    return Backbone.View.extend({
        NAME: 'CountdownView',

        initialize : function(options) {
            this.colorsapp = options.colorsapp;
            this.remainingTime = options.duration || 5;
        },

        render : function() {
            var self = this;

            self.$el.html(self.colorsapp.template("CountdownViewTemplate"));

            self.$counter = self.$el.find('.counter');

            self.updateCountdown();
        },

        remove: function() {
            clearTimeout(this.countdown);
            this.$el.remove();
        },

        updateCountdown: function() {
            this.$counter.html(this.remainingTime);

            this.remainingTime--;

            if (this.remainingTime < -1) {
                this.trigger('finished');
            } else {
                Utils.sound.playSound('stress_count');
                this.countdown = setTimeout(this.updateCountdown.bind(this), 1000);
            }
        }
    });
});
