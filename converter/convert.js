const Influx = require('influx')
const influx = new Influx.InfluxDB({
  host: 'localhost',
  database: 'icinga'
})

var newfangledStuff = ['apt', 'cluster-zone', 'cpu_load_short', 'disk', 'dummy', 'hostalive', 'ib-host', 'icinga', 'iostat', 'load', 'mem', 'procs', 'users', 'infiniband', 'smart', 'ceph']

// List hosts, filtering out newish measurements
influx.getMeasurements().then(results => {
  results.forEach(function(entry) {
    if (newfangledStuff.indexOf(entry) < 0) {
      if(entry == 'mon_sos_ethz_ch') {
        processHost(entry)
      }
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
  
  // 'Switch' out the simple checks first.
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
    if (retval['source'] == 'http') {
      // Happenes for very old data
      retval['source'] = ipmiSource
    }
    retval['metric'] = metric // WITH UNDERSCORES!
    return retval
  } else if (checkname.indexOf("infiniband") == 0) {
    // syntax: infiniband_hostname
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
  return null
}
function processHost(name) {
  // Find all checks of host
  influx.query('SHOW TAG VALUES FROM "'+ name+'" WITH KEY = "check"').then(results => {
	  results.forEach(function(entry) {
      // Find all metrics of (host, check)
      influx.query('SHOW TAG VALUES FROM "'+ name+'" WITH KEY = "metric" WHERE check=\''+ entry['value']+ '\'').then(results => {
    	  results.forEach(function(entryM) {
          // Map to new schema
          var metadata = mapCheckToDict(name, entry['value'], entryM['value'])
          
          if (metadata) {
            // Mapping succesfull -> convert data
            influx.query("SELECT value FROM "+ name+ " WHERE check='"+ entry['value']+ "' AND metric='"+ entryM['value']+ "'").then(results => {
              // results is an array of dicts, where each dict has a key value (obvious) and a key time(that contains two timestamps and two functions)
              console.log("Processing check '"+ entry['value']+ "' (metric '"+ entryM['value']+ "') for host "+ name)
              process.stdout.write("Converting data... ")
              var points = []
              results.forEach(function testfun(sPoint) {
                var tmp = {}
                tmp[metadata['metric']] = sPoint['value']
                points.push({
                  measurement: metadata['measurement'],
                  tags: {source: metadata['source'], hostname: metadata['hostname'] },
                  fields: tmp,
                  timestamp: sPoint['time']
                })
              })
              console.log("done.")
              process.stdout.write("Writing to DB...")
              influx.writePoints(points, {
                database: 'icinga',
                precision: 's'
              }).catch(err => {
            		console.log("Error when converting check '"+ entry['value']+ "' (metric '"+ entryM['value']+ "') for host "+ name)
                console.log("New metadata: ")
                console.log(metadata)
                console.log(err)
                return
            	})
              console.log("done.")
            })
          }
        })
      })
    })
	}, err => {
		console.log(err)
	})
}
