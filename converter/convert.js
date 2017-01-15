const Influx = require('influx');
const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'icinga'
});

var newfangledStuff = ['apt', 'cluster-zone', 'cpu_load_short', 'disk', 'dummy', 'hostalive', 'ib-host', 'icinga', 'iostat', 'load', 'mem', 'procs', 'users'];
influx.getMeasurements().then(results => {
  results.forEach(function(entry) {
    if (newfangledStuff.indexOf(entry) < 0) {
      console.log("Processing entry: "+ entry)
      if(entry == 'portal-lee2_ethz_ch') {
        processHost(entry);
      }
    }
  })
}, err => {
  console.log(err);
});

function mapCheckToDict(name) {
  console.log('key: '+ name)
  switch (name) {
    case 'apt':
      return {'name': 'apt'};
    default: 
      if (name.indexOf("disk") > 0) {
        console.log('disk!')
        return {'check': 'disk', 'service': (name.replace('disk_', 'disk ').replace('_', '/'))}
      }
  }
}
function processHost(name) {
  influx.query('SHOW TAG VALUES FROM "'+ name+'" WITH KEY = "check"').then(results => {
	  results.forEach(function(entry) {
      var result = mapCheckToDict(entry['value']);
      console.log(result);
    })
	}, err => {
		console.log(err);
	});
}
/*var dateFormat = require('dateformat');
var stat = require('simple-statistics');

var config = require('./config.json');
config = config[dataName];
var slotlen = config["slotlen"];
var slots = config["slots"];
var vars = config["vars"];

if (functionName == "maxTps") {
	maxTps();
} else if (functionName == "writeStat") {
	repEffWrite();
} else if (functionName == "readStat") {
	repEffRead();
} else if (functionName == "maxTpsW") {
	maxTpsW();
} else if (functionName == "writeStatW") {
	repEffWriteW();
} else if (functionName == "readStatW") {
	repEffReadW();
}

function repEffWrite() {
	var tpsout = fs.createWriteStream("../write_tps.csv", {flags: "w+"});
	var tpsout_intr = fs.createWriteStream("../write_tps_intr.csv", {flags: "w+"});
	var exprs = config["exprs"];
	calcTPS(0, exprs, writeTpsOut, tpsout, tpsout_intr, "TSet", true);
	var latout = fs.createWriteStream("../write_lat.csv", {flags: "w+"});
	var latout_intr = fs.createWriteStream("../write_lat_intr.csv", {flags: "w+"});
	calcTime(0, exprs, writeTpsOut, latout, latout_intr, "TSet");
	var ptout = fs.createWriteStream("../write_full.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunNormal, ptout, undefined, "TSet");
	var ptoutsrv = fs.createWriteStream("../write_server.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunNormal, ptoutsrv, undefined, "TSetServer");
	var ptoutq = fs.createWriteStream("../write_queue.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunNormal, ptoutq, undefined, "TSetQueue");
}

function repEffRead() {
	var tpsout = fs.createWriteStream("../read_tps.csv", {flags: "w+"});
	var exprs = config["exprs"];
	calcTPS(0, exprs, writeTpsOut, tpsout, undefined, "TGet", false);
	var latout = fs.createWriteStream("../read_lat.csv", {flags: "w+"});
	calcTime(0, exprs, writeTpsOut, latout, undefined, "TGet");
	var ptout = fs.createWriteStream("../read_full.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunNormal, ptout, undefined, "TGet");
	var ptoutsrv = fs.createWriteStream("../read_server.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunNormal, ptoutsrv, undefined, "TGetServer");
	var ptoutq = fs.createWriteStream("../read_queue.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunNormal, ptoutq, undefined, "TGetQueue");
}

function repEffWriteW() {
	var tpsout = fs.createWriteStream("../we_write_tps.csv", {flags: "w+"});
	var tpsout_intr = fs.createWriteStream("../we_write_tps_intr.csv", {flags: "w+"});
	var exprs = config["exprs"];
	calcTPS(0, exprs, writeTpsOut, tpsout, tpsout_intr, "TSet", true);
	var latout = fs.createWriteStream("../we_write_lat.csv", {flags: "w+"});
	var latout_intr = fs.createWriteStream("../we_write_lat_intr.csv", {flags: "w+"});
	calcTime(0, exprs, writeTpsOut, latout, latout_intr, "TSet");
	var ptout = fs.createWriteStream("../we_write_full.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunW, ptout, undefined, "TSet");
	var ptoutsrv = fs.createWriteStream("../we_write_server.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunW, ptoutsrv, undefined, "TSetServer");
	var ptoutq = fs.createWriteStream("../we_write_queue.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunW, ptoutq, undefined, "TSetQueue");
}

function repEffReadW() {
	var tpsout = fs.createWriteStream("../we_read_tps.csv", {flags: "w+"});
	var exprs = config["exprs"];
	calcTPS(0, exprs, writeTpsOut, tpsout, undefined, "TGet", false);
	var latout = fs.createWriteStream("../we_read_lat.csv", {flags: "w+"});
	calcTime(0, exprs, writeTpsOut, latout, undefined, "TGet");
	var ptout = fs.createWriteStream("../we_read_full.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunW, ptout, undefined, "TGet");
	var ptoutsrv = fs.createWriteStream("../we_read_server.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunW, ptoutsrv, undefined, "TGetServer");
	var ptoutq = fs.createWriteStream("../we_read_queue.csv", {flags: "w+"});
	printAllPoints(0, exprs, writeFunW, ptoutq, undefined, "TGetQueue");
}

function maxTpsTpsOut(output, output2, entry, res) {
	var entryStr = entry["clients"]+","+ entry["threads"]+","+res[1][0] + ","+ res[1][1]+"\n";
	if (!(config["interesting"] === 'undefined')) {
		if (config["interesting"]["clients"].includes(entry["clients"])) {
			if (config["interesting"]["threads"].includes(entry["threads"])) {
				output2.write(entryStr);
			}
		}
	} else {
		console.log("intersting is undefined :(");
	}
	output.write(entryStr);
}
function maxTpsTpsOutW(output, output2, entry, res) {
	var entryStr = entry["servers"]+","+ entry["repfactor"]+","+ entry["writepct"]+","+res[1][0] + ","+ res[1][1]+"\n";
	output.write(entryStr);
}

function writeTpsOut(output, output2, entry, res) {
	output.write(entry["servers"]+","+ entry["repfactor"]+","+res[1][0] + ","+ res[1][1]+"\n");
}

function maxTps() {
	// Extract mean TPS with 99% confidence interval
	var exprs = config["exprs"];
	exprs.sort(sortConfig);
	var tpsout = fs.createWriteStream("../max_tps.csv", {flags: "w+"});
	var tpsout_intr = fs.createWriteStream("../max_tps_intr.csv", {flags: "w+"});
	calcTPS(0, exprs, maxTpsTpsOut, tpsout, tpsout_intr, "TFull", false);
	
	var latout = fs.createWriteStream("../max_lat.csv", {flags: "w+"});
	var latout_intr = fs.createWriteStream("../max_lat_intr.csv", {flags: "w+"});
	// Extract mean response time with 99% confidence interval
	calcTime(0, exprs, maxTpsTpsOut, latout, latout_intr, "TFull");
	
	var srvout = fs.createWriteStream("../max_server.csv", {flags: "w+"});
	var srvout_intr = fs.createWriteStream("../max_server_intr.csv", {flags: "w+"});
	// Extract mean response time with 99% confidence interval
	calcTime(0, exprs, maxTpsTpsOut, srvout, srvout_intr, "Tserver");
	
	var queueout = fs.createWriteStream("../max_qu.csv", {flags: "w+"});
	var queueout_intr = fs.createWriteStream("../max_qu_intr.csv", {flags: "w+"});
	// Extract mean response time with 99% confidence interval
	calcTime(0, exprs, maxTpsTpsOut, queueout, queueout_intr, "Tqueue");
}

function maxTpsW() {
	// Extract mean TPS with 99% confidence interval
	var exprs = config["exprs"];
	//exprs.sort(sortConfig);
	var tpsout = fs.createWriteStream("../we_max_tps.csv", {flags: "w+"});
	var tpsout_intr = fs.createWriteStream("../we_max_tps_intr.csv", {flags: "w+"});
	calcTPSW(0, exprs, maxTpsTpsOutW, tpsout, tpsout_intr, "TFull", false);
	
	var latout = fs.createWriteStream("../we_max_lat.csv", {flags: "w+"});
	var latout_intr = fs.createWriteStream("../we_max_lat_intr.csv", {flags: "w+"});
	// Extract mean response time with 99% confidence interval
	calcTime(0, exprs, maxTpsTpsOutW, latout, latout_intr, "TFull");
	
	var queueout = fs.createWriteStream("../we_max_qu.csv", {flags: "w+"});
	var queueout_intr = fs.createWriteStream("../we_max_qu_intr.csv", {flags: "w+"});
	// Extract mean response time with 99% confidence interval
	calcTime(0, exprs, maxTpsTpsOutW, queueout, queueout_intr, "Tqueue");
}

function calcTPS(i, exprs, writeFun, out, intrOut, field, iswrite) {
	var entry = exprs[i];
	influx.query("SELECT (count(value)"+(iswrite ? "*1" : "*100")+ ") FROM "+ field+ " WHERE time >= '"+ entry["begin"]+ "' AND time <= '"+ entry["end"]+ "' GROUP BY time(10ms)").then(results => {
		var res = []
		var count = results.length;
		if (count%3 != 0) {
			console.log("ERROR: count " + count +" is not divisable by 3! entry: "+ entry);
			return;
		}
		var num = count/3;
		res[0] = calculateMean(entry, results,0,num-1,1,"count",out,60);
		res[1] = calculateMean(entry, results,num,2*num-1,2,"count",out,60);
		res[2] = calculateMean(entry, results,2*num,3*num-1,3,"count",out,60);
		res.sort(sortByFirstElement);
		writeFun(out, intrOut, entry, res);
		//tpsout.write(entry["clients"]+","+ entry["threads"]+","+res[1][0] + ","+ res[1][1]+"\n");
		if (i < exprs.length-1) {
			calcTPS(i+1, exprs, writeFun, out, intrOut, field, iswrite);
		}
	}, err => {
		console.log(err);
	});
}

function calcTPSW(i, exprs, writeFun, out, intrOut, iswrite) {
	console.log("calctpsw");
	var entry = exprs[i];
	influx.query("SELECT (count(value)*100) FROM TGet WHERE time >= '"+ entry["begin"]+ "' AND time <= '"+ entry["end"]+ "' GROUP BY time(10ms)").then(results => {
		var res = []
		var count = results.length;
		if (count%3 != 0) {
			console.log("ERROR: count " + count +" is not divisable by 3! entry: "+ entry);
			return;
		}
		var num = count/3;
		influx.query("SELECT count(value) FROM TSet WHERE time >= '"+ entry["begin"]+ "' AND time <= '"+ entry["end"]+ "' GROUP BY time(10ms)").then(resultsi => {
			if (count != resultsi.length) {
				console.log("count mismatch!");
				return;
			}
			for (var k = 0; k < results.length; k++) {
				results[k]["count"] += resultsi[k]["count"];
			}
			res[0] = calculateMean(entry, results,0,num-1,1,"count",out,60);
			res[1] = calculateMean(entry, results,num,2*num-1,2,"count",out,60);
			res[2] = calculateMean(entry, results,2*num,3*num-1,3,"count",out,60);
			res.sort(sortByFirstElement);
			writeFun(out, intrOut, entry, res);
			//tpsout.write(entry["clients"]+","+ entry["threads"]+","+res[1][0] + ","+ res[1][1]+"\n");
			if (i < exprs.length-1) {
				calcTPSW(i+1, exprs, writeFun, out, intrOut, iswrite);
			}
		}, err => {
			console.log(err);
		});
	}, err => {
		console.log(err);
	});
}

function quantile(p, mean, stddev) {
	return mean + stddev*Math.sqrt(2)*stat.inverseErrorFunction(2*p-1);
}

function calculateMean(entry, results, begin, end, rep, field, out, period){
	var mean = 0;
	for (var i = begin; i <= end; i++) {
		if (typeof results[i] === 'undefined') {
			console.log("ERROR: undefined, i: "+ i);
		} else {
			mean += results[i][field];
		}
	}
	mean /= period;
	var svar = 0;
	for (var i = begin; i <= end; i++) {
		svar = Math.pow(results[i][field]-mean,2);
	}
	svar /= period;
	svar = Math.sqrt(svar);
	//console.log("Sample mean: "+ mean+ ", deviation: "+svar);
	var cval = 0.01;
	var fact = svar/Math.sqrt(period);
	//out.write(entry["clients"]+","+ entry["threads"]+","+rep+","+mean + ","+ (quantile(1-(cval/2), 0, 1)*fact)+"\n");
	return [mean, (quantile(1-(cval/2), 0, 1)*fact)];
}

function sortByFirstElement(a, b) {
	if (a[0] === b[0]) {
		return 0;
	} else {
		return (a[0] < b[0]) ? -1 : 1;
	}
	
}

function sortConfig(a, b) {
	if (a["threads"] === b["threads"]) {
		if (a["clients"] === b["clients"]) {
			return 0;
		} else {
			return (a["clients"] < b["clients"]) ? -1 : 1;
		}
	} else {
		return (a["threads"] < b["threads"]) ? -1 : 1;
	}
	
}

function calcTime(i, exprs, writeFun, out, intrOut, field) {
	var entry = exprs[i];
	influx.query("SELECT (mean(value)) FROM "+ field+ " WHERE time >= '"+ entry["begin"]+ "' AND time <= '"+ entry["end"]+ "' GROUP BY time(10ms)").then(results => {
		var res = []
		var count = results.length;
		if (count%3 != 0) {
			console.log("ERROR: count " + count +" is not divisable by 3! entry: ");
			console.log(entry);
			return;
		}
		var num = count/3;
		res[0] = calculateMean(entry, results,0,num-1,1,"mean",out,num);
		res[1] = calculateMean(entry, results,num,2*num-1,2,"mean",out,num);
		res[2] = calculateMean(entry, results,2*num,3*num-1,3,"mean",out,num);
		res.sort(sortByFirstElement);
		writeFun(out, intrOut, entry, res);
		//latout.write(entry["clients"]+","+ entry["threads"]+","+res[1][0] + ","+ res[1][1]+"\n");
		if (i < exprs.length-1) {
			return calcTime(i+1, exprs, writeFun, out, intrOut, field);
		}
	}, err => {
		console.log(err);
	});
}

function writeFunNormal(out, entry, results, j) {
	out.write(entry["servers"]+","+entry["repfactor"]+","+results[j]["value"]+"\n");
}

function writeFunW(out, entry, results, j) {
	out.write(entry["servers"]+","+entry["repfactor"]+","+entry["writepct"]+","+results[j]["value"]+"\n");
}

function printAllPoints(i, exprs, writeFun, out, intrOut, field) {
	var entry = exprs[i];
	influx.query("SELECT percentile(value, 99.9) FROM "+ field+ " WHERE time >= '"+ entry["begin"]+ "' AND time <= '"+ entry["end"]+ "'").then(results => {
		var pct = results[0]["percentile"];
		influx.query("SELECT value FROM "+ field+ " WHERE time >= '"+ entry["begin"]+ "' AND time <= '"+ entry["end"]+ "'").then(results => {
			var res = []
			var count = results.length;
			for (var j = 0; j < results.length; j++) {
				if (results[j]["value"] <= pct) {
					writeFun(out, entry, results, j);
				}
			}
			/*console.log(count);
			console.log(results[0]);*/
			/*if (count%3 != 0) {
				console.log("ERROR: count " + count +" is not divisable by 3!");
			}
			var num = count/3;
			res[0] = calculateMean(entry, results,0,num-1,1,"mean",out,num);
			res[1] = calculateMean(entry, results,num,2*num-1,2,"mean",out,num);
			res[2] = calculateMean(entry, results,2*num,3*num-1,3,"mean",out,num);
			res.sort(sortByFirstElement);
			writeFun(out, intrOut, entry, res);*/
			//latout.write(entry["clients"]+","+ entry["threads"]+","+res[1][0] + ","+ res[1][1]+"\n");
			/*if (i < exprs.length-1) {
				printAllPoints(i+1, exprs, writeFun, out, intrOut, field);
			}
		}, err => {
			console.log(err);
		});
	}, err => {
		console.log(err);
	});
}*/
