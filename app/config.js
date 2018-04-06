define(function () {

	var dev = false;
	if (window.location.hostname.indexOf("localhost") != -1)
		dev = true;
		
	var settings =  {
		
		servers: [
			"https://mpi-mint1.shh.mpg.de",
			"https://mpi-mint2.shh.mpg.de"
		],
		debug: false
	}
	
	if (dev)
	{
		settings.servers = [
			"https://mpi-mint1.shh.mpg.de",
			"https://mpi-mint2.shh.mpg.de"
		];
		settings.debug = true;
	}
	
	return settings;
});