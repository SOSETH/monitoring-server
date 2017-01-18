const Influx = require('influx')
const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'icinga'
})

var newfangledStuff = ['apt', 'cluster-zone', 'cpu_load_short', 'disk', 'dummy', 'hostalive', 'ib-host', 'icinga', 'iostat', 'load', 'mem', 'procs', 'users', 'infiniband', 'smart']
influx.getMeasurements().then(results => {
  results.forEach(function(entry) {
    if (newfangledStuff.indexOf(entry) < 0) {
      console.log("Processing entry: "+ entry)
      //if(entry == 'mon_sos_ethz_ch') {
        processHost(entry)
      //}
    }
  })
}, err => {
  console.log(err)
})

var hostDevicesToMointpointMap = {
  "portal-lee2_ethz_ch" : {
    "/dev/sda1": "/"
  },
  "mon_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "mon-cab_sos_ethz_ch" : {
    "/dev/sda1": "/boot",
    "/dev/sda2": "/",
  },
  "comp-1_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "comp-2_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "comp-3_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "ceph-a_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "ceph-b_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "ceph-c_sos_ethz_ch" : {
    "/dev/md0": "/"
  },
  "files_sos_ethz_ch" : {
    "/dev/vdb": "/"
  },
  "cm_sos_ethz_ch" : {
    "/dev/md0": "/"
  }
}
var passThroughChecks = ['apt', 'icinga', 'ceph', 'cluster-zone', 'load', 'mem', 'procs', 'users', 'hostalive']
var ibSource = "mon.sos.ethz.ch"
var ipmiSource = "portal-lee2.ethz.ch"
var powerSource = "portal-lee2.ethz.ch"

function mapCheckToDict(host, checkname, metric) {
  /*
   * Old: host as measurement, checkname and metric as tags, e.g.
   * portal-lee2_ethz_ch, checkname=disk__dev_sda1, metric=Temperature...
   * New: check as measurement, hostname, metric and source as tags
   * disk, host=lee2_ethz_ch, metric=Temperature sda, source=local
   * source is local except for power, ipmi, website, infiniband
  */
  var retval = {'source': 'local', 'hostname': host.replace(/_/g, '.'), 'metric': metric}
  
  // 'Switch' out the simple checks first. Default is the more involved stuff
  if (passThroughChecks.indexOf(checkname) >= 0) {
    retval['measurement'] = checkname
    return retval
  } else if (checkname.indexOf("disk") == 0) {
    // Disk check, syntax: disk__dev_sda1
    retval['measurement'] = 'disk'
    retval['metric'] = hostDevicesToMointpointMap[host][checkname.replace('disk_', '').replace(/_/g, '/')]
    return retval
  } else if (checkname.indexOf("http") == 0) {
    retval['measurement'] = 'http'
    retval['source'] = checkname.replace('http_', '').replace(/_/g, '.')
    retval['metric'] = metric // WITH UNDERSCORES!
    return retval
  } else if (checkname.indexOf("infiniband") == 0) {
    // Disk check, syntax: infiniband_hostname
    retval['measurement'] = 'ib-host'
    retval['source'] = ibSource
    retval['metric'] = metric.replace(/_/g, ' ')
    return retval
  } else if (checkname.indexOf("ipmi") == 0) {
    retval['measurement'] = 'ipmi'
    retval['source'] = ipmiSource
    retval['metric'] = metric.replace(/_/g, ' ')
    return retval
  } else if (checkname.indexOf("smart") == 0) {
    retval['measurement'] = 'smart'
    retval['metric'] = metric.replace(/_dev/, '/dev').replace(/_s/, '/s').replace(/_-_/, ' - ')
    return retval
  } else if (checkname.indexOf("power") == 0) {
    retval['measurement'] = 'power'
    retval['source'] = powerSource
    retval['metric'] = metric.replace(/_/g, ' ')
    return retval
  } else if (checkname.indexOf("iostat") == 0) {
    retval['measurement'] = 'iostat'
    retval['source'] = checkname.replace(/iostat_/, '/dev/')
    retval['metric'] = metric.replace(/_s/, '/s')
    return retval
  } else if (checkname == "ping4" || checkname == "ping6" || checkname == "ssh" || checkname == "swap")
    return null
  console.log("PANIC: Unknown check '"+ checkname+ "', will not be converted!")
}
function processHost(name) {
  influx.query('SHOW TAG VALUES FROM "'+ name+'" WITH KEY = "check"').then(results => {
	  results.forEach(function(entry) {
      influx.query('SHOW TAG VALUES FROM "'+ name+'" WITH KEY = "metric" WHERE check=\''+ entry['value']+ '\'').then(results => {
    	  results.forEach(function(entryM) {
          /*console.log("Check: " + entry['value'])
          console.log("Metric: " + entryM['value'])*/
          var result = mapCheckToDict(name, entry['value'], entryM['value'])
          //console.log(result)
        })
      })
    })
	}, err => {
		console.log(err)
	})
}
