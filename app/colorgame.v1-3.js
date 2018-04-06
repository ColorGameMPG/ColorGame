requirejs.config({
	// cache buster
	//urlArgs: "t=" + new Date().getTime(),

	paths: {
		jquery: "vendor/jquery",
		backbone: "vendor/backbone",
		underscore: "vendor/underscore",
		parse: "vendor/parse",
		box2d: "vendor/box2d",
		paperfold: "vendor/paperfold",
		moment : "vendor/moment",
		machina: "vendor/machina",
		lodash: "vendor/lodash",
		prefetchImage: "vendor/prefetch-image",
		shim: "vendor/shim",
        json: 'vendor/require/json',
        text: 'vendor/require/text'
  	},
  	waitSeconds : 0,
	config : {
		colorsApp : {
			version : "0.1"
		}
	},
	shim: {
		backbone: {
			deps: ["jquery", "underscore"],
			exports: "Backbone"
		},
		parse : {
			exports: "Parse"
		},
		box2d : {
			exports: "box2d"
		},
		paperfold : {
			deps: ["jquery"]
		},
		underscore: {
			exports: "_"
		},
		moment : {
			exports : "moment"
		}

	}
});

window.spinner_opts = {
			  lines: 11 // The number of lines to draw
			, length: 17 // The length of each line
			, width: 14 // The line thickness
			, radius: 24 // The radius of the inner circle
			, scale: 0.25 // Scales overall size of the spinner
			, corners: 1 // Corner roundness (0..1)
			, color: '#AAA' // #rgb or #rrggbb or array of colors
			, opacity: 0.25 // Opacity of the lines
			, rotate: 0 // The rotation offset
			, direction: 1 // 1: clockwise, -1: counterclockwise
			, speed: 1 // Rounds per second
			, trail: 60 // Afterglow percentage
			, fps: 20 // Frames per second when using setTimeout() as a fallback for CSS
			, zIndex: 2e9 // The z-index (defaults to 2000000000)
			, className: 'spinner' // The CSS class to assign to the spinner
			, top: '50%' // Top position relative to parent
			, left: '50%' // Left position relative to parent
			, shadow: false // Whether to render a shadow
			, hwaccel: false // Whether to use hardware acceleration
			, position: 'absolute' // Element positioning
			};


require( ["jquery", "parse", "config", "colors_app", "underscore", "shim"], function(Jquery,Parse,Config, ColorsApp) {
	console.log('Starting colorgame app...',Config);

	
	function getStartOptions(servers) {

		return new Promise(function(resolve, reject) {

			var count = 0;
			var found = false;
			_.forEach(servers,function (server) {
				
				count++;
				$.getJSON(server + "/status")
					.done(function(data) 
					{
						if (!found && data.enabled ) 
						{
							found = true;
							resolve(server);
						}
					})
					.fail(function(e) {
					//	console.log(e);
					})
					.always(function() {
						
						count--;

						if (count == 0 && !found)
						{
							reject("no active server found");
						}

					});
			});
		});
	}

	

	function waitForCordovaStart(options)
	{
		return new Promise(function(resolve, reject) {
			document.addEventListener('deviceready', function() {
				resolve();
			}, false);
		});
	}
	
	function showSpinner(visible)
	{
		if(visible)
			$("#loadCircle").removeClass("hidden");
		else
			$("#loadCircle").addClass("hidden");
	}
	
	
	var isCordova = navigator.userAgent.match(/Cordova/i);
	
	showSpinner(true);
	
	console.log('Loading templates...');
	$( "#ColorsTemplates" ).load( "app/html/views.html").promise().then(function(){
	
		if(isCordova) {
			console.log('Waiting for cordova startup...');
			$.getScript("cordova.js");
			return waitForCordovaStart();
		} else {
			return;
		}
			
	}).then(function(){
		
		console.log('Loading start options...');
		return getStartOptions(Config.servers);
		
	}).then(function(server){
		
		console.log('Creating main app...');
		console.log("use server",server)
		showSpinner(false);
		return new ColorsApp(
			{
				debug:Config.debug,
				parseServerUrl:server+"/parse"
			});
		
	}).catch(function(error)
	{
	 	console.log( "error starting app: ", error);
	});
	
	FastClick.attach(document.body);
});
