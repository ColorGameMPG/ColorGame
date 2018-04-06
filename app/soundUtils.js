define(["json!sounds.json"], function (Sounds) {

	// return a simple utils object 
	return {	
		
		init : function() {
			var self = this;
			self.sounds = {};
			
			_.forEach(Sounds,function(value,key){
				self.sounds[key] = new Array();
				self.sounds[key].push(new Audio(value));
			});
		},	


		playSound : function(which, forceNew, loop) {
			var self = this;
			if(forceNew) {
				var v = new Audio(Sounds[which]);
				v.loop = (loop === true);
				v.play();
				return v;
			}
			if(which == "icon") {
				which = "icons_" + (1 + parseInt(Math.random()*1000%7));
			} else if(which == "color") {
				which = "color_" + (1 + parseInt(Math.random()*1000%4));
			}
			if(self.sounds[which]) {
				var pool = self.sounds[which];
				var audio;
				for (var i = 0; i < pool.length; i++) {
					if (pool[i].paused) {
						audio = pool[i];
						break;
					}
				}
				
				if (!audio) {
					audio = new Audio(Sounds[which]);
					pool.push(audio);
				}

				audio.loop = (loop === true);
				audio.play();

				return audio;
			}
		}
    };
});
