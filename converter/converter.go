package main

import (
	"github.com/influxdata/influxdb/client/v2"
	"log"
	"fmt"
	"strings"
	"time"
	"encoding/json"
)

var newfangledStuff = []string {"apt", "cluster-zone", "cpu_load_short", "disk", "dummy", "hostalive", "ib-host", "icinga", "iostat", "load", "mem", "procs", "users", "infiniband", "smart", "ceph", "http"}
var passThroughChecks = []string {"apt", "icinga", "ceph", "cluster-zone", "load", "mem", "procs", "users", "hostalive"}
var ibSource = "mon.sos.ethz.ch"
var ipmiSource = "portal-lee2.ethz.ch"
var powerSource = "portal-lee2.ethz.ch"

var hostDevicesToMointpointMap = map[string]map[string]string {
	"portal-lee2_ethz_ch" : {
		"/dev/sda1": "/",
	},
	"mon_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"mon-cab_sos_ethz_ch" : {
		"/dev/sda1": "/boot",
		"/dev/sda2": "/",
	},
	"comp-1_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"comp-2_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"comp-3_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"ceph-a_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"ceph-b_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"ceph-c_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
	"files_sos_ethz_ch" : {
		"/dev/vdb": "/",
	},
	"cm_sos_ethz_ch" : {
		"/dev/md0": "/",
	},
}

func mapCheckToDict(host string, checkname string, metric string) map[string]string {
	/*
	 * Old: host as measurement, checkname and metric as tags, e.g.
	 * portal-lee2_ethz_ch, checkname=disk__dev_sda1, metric=Temperature...
	 * New: check as measurement, hostname, metric and source as tags
	 * disk, host=lee2_ethz_ch, metric=Temperature sda, source=local
	 * source is local except for power, ipmi, website, infiniband
	*/
	var retval = map[string]string {"source": "local", "hostname": strings.Replace(host, "_", ".", -1), "metric": metric}

	// "Switch" out the simple checks first.
	for _, elm := range passThroughChecks {
		if (strings.Contains(elm, checkname)) {
			retval["measurement"] = checkname
			return retval
		}
	}
	if (strings.Index(checkname, "disk") == 0) {
		// Disk check, syntax: check: disk, metric: _
		retval["measurement"] = "disk"
		// hostDevicesToMointpointMap[host][checkname.replace('disk_', '').replace(/_/g, '/')]
	    	retval["metric"] = hostDevicesToMointpointMap[host][strings.Replace(strings.Replace(checkname, "disk_", "", 1), "_", "/", -1)]
		if (retval["metric"] == "disk") {
			return nil
		}
		return retval
	} else if (strings.Index(checkname, "http") == 0) {
		retval["measurement"] = "http"
		retval["source"] = strings.Replace(strings.Replace(checkname, "http_", "", 1),"_", ".", 0)
		if (retval["source"] == "http") {
			// Happenes for very old data
			retval["source"] = ipmiSource
		}
		retval["metric"] = metric // WITH UNDERSCORES!
		return retval
	} else if (strings.Index(checkname, "infiniband") == 0) {
		// syntax: infiniband_hostname
		retval["measurement"] = "infiniband"
		retval["source"] = ibSource
		retval["metric"] = strings.Replace(metric, "_", " ", -1)
		return retval
	} else if (strings.Index(checkname, "ipmi") == 0) {
		retval["measurement"] = "ipmi"
	    	retval["source"] = ipmiSource
		retval["metric"] = strings.Replace(metric, "_", " ", -1)
		return retval
	} else if (strings.Index(checkname, "smart") == 0) {
		retval["measurement"] = "smart"
		retval["metric"] = strings.Replace(strings.Replace(strings.Replace(metric, "_dev", "/dev", 1), "_s", "/s", 1), "_-_", " - ", 1)
		return retval
	} else if (strings.Index(checkname, "power") == 0) {
		retval["measurement"] = "power"
		retval["source"] = powerSource
		retval["metric"] = strings.Replace(metric, "_", " ", -1)
		return retval
	} else if (strings.Index(checkname, "iostat") == 0) {
		retval["measurement"] = "iostat"
		retval["source"] = strings.Replace(checkname, "iostat_", "/dev/", 1)
		retval["metric"] = strings.Replace(metric, "_s", "/s", 1)
		return retval
	} else if (checkname == "ping4" || checkname == "ping6" || checkname == "ssh" || checkname == "swap") {
		return nil
	}
	log.Fatal("ERR: Unknown check "+ checkname+ ", will not be converted!")
	return nil
}

type MoveDataJob struct {
	source client.Client
	destination client.Client
	mapping map[string]string
	host string
	check string
	metric string
}

func moveData(queue chan MoveDataJob, cmds chan string) {
	for {
		select {
		case job := <-queue:
		host := job.host
		check := job.check
		metric := job.metric
		destination := job.destination
		source := job.source
		mapping := job.mapping
		/*if (!strings.Contains(check, "ipmi")) {
			continue
		}
		log.Println("Mapping: ", mapping)*/
		//error parsing query: at least 1 non-time field must be queried
		// Get oldest entry
		query := client.Query{
			Command: "SELECT time, value FROM \"" + host + "\" WHERE check='" + check + "' AND metric='" + metric + "' ORDER BY time LIMIT 1",
			Database: "icinga",
		}
		data, err := source.Query(query)
		if (err != nil) {
			log.Fatalln("Coudln't read time: ", err)
		}
		if (len(data.Results) == 0) {
			log.Println("WARNING: Result is empty, not gonna do this one...", data)
			continue
		}
		oldest, err := time.Parse(time.RFC3339, data.Results[0].Series[0].Values[0][0].(string))
		if (err != nil) {
			log.Fatalln("Coudln't parse time: ", err)
		}
		// Get newest entry
		query = client.Query{
			Command: "SELECT time, value FROM \"" + host + "\" WHERE check='" + check + "' AND metric='" + metric + "' ORDER BY time DESC LIMIT 1",
			Database: "icinga",
		}
		data, err = source.Query(query)
		if (err != nil) {
			log.Fatalln("Coudln't read time: ", err)
		}
		newest, err := time.Parse(time.RFC3339, data.Results[0].Series[0].Values[0][0].(string))
		if (err != nil) {
			log.Fatalln("Coudln't parse time: ", err)
		}
		duration := newest.Sub(oldest)
		duration = duration / 10

		for oldest.Before(newest) {
			start := oldest.Format(time.RFC3339)
			oldest = oldest.Add(duration)
			end := oldest.Format(time.RFC3339)
			query := client.Query{
				Command: "SELECT value FROM \"" + host + "\" WHERE check='" + check + "' AND metric='" + metric + "' AND time >= '"+ start+ "' AND time <= '"+ end+"'",
				Database: "icinga",
			}
			data, err := source.Query(query)
			if (err != nil) {
				log.Fatalln("Coudln't read source data: ", err)
			}
			bp, _ := client.NewBatchPoints(client.BatchPointsConfig{
				Database:  "icinga",
				Precision: "s",
			})
			tags := map[string]string{
				"source": mapping["source"],
				"hostname": mapping["hostname"],
				"metric": mapping["metric"],
			}
			// Since JSON is so very untyped, we need to find out the type of our value...
			if (len(data.Results[0].Series) == 0) {
				continue
			}
			_, numeric := data.Results[0].Series[0].Values[0][1].(json.Number)
			for _, row := range data.Results[0].Series[0].Values {
				// 0: date, 1: data
				fields := map[string]interface{}{}
				if (numeric) {
					val, err := (row[1].(json.Number)).Float64()
					if (err != nil) {
						log.Fatal("Coudln't parse number: ", err)
					}
					fields["value"] = val
				} else {
					fields["value"] = row[1].(string)
				}

				timeVal, err := time.Parse(time.RFC3339, row[0].(string))
				if (err != nil) {
					log.Fatal("Couldn't create point", err)
				}
				point, err := client.NewPoint(mapping["measurement"], tags, fields, timeVal)
				if (err != nil) {
					log.Fatal("Couldn't create point", err, "mapping was", mapping)
				}
				bp.AddPoint(point)

			}
			err = destination.Write(bp)
			if (err != nil) {
				log.Fatal("Couldn't write to destination: ", err)
			}
		}
		//log.Println("Processed "+ metric+" of check "+ check+" of host "+ host)

		case _ = <-cmds:
			break
		}

	}
}

func processHost(name string, source client.Client, destination client.Client) {
	query := client.Query{
		Command: "SHOW TAG VALUES FROM \""+ name+"\" WITH KEY = \"check\"",
		Database: "icinga",
	}
	checks, err := source.Query(query)
	if err != nil {
		log.Fatalln("Error: ", err)
		return
	}
	if len(checks.Results) <= 0 {
		log.Fatal("Error: No results returned while looking up checks for host "+ name)
	}
	if len(checks.Results[0].Series) <= 0 {
		log.Fatal("Error: Empty result returned while looking up checks for host "+ name)
	}
	queue := make(chan MoveDataJob)
	cmds := make(chan string)
	for i := 0; i < 16; i++ {
		go moveData(queue, cmds)
	}
	for _, checkR := range checks.Results[0].Series[0].Values {
		check := checkR[1].(string)
		query := client.Query{
			Command: "SHOW TAG VALUES FROM \""+ name+"\" WITH KEY = \"metric\" WHERE check='"+ check+ "'",
			Database: "icinga",
		}
		metrics, err := source.Query(query)
		if err != nil {
			log.Fatalln("Error: ", err)
			return
		}
		for _, metricR := range metrics.Results[0].Series[0].Values {
			metric := metricR[1].(string)
			mapped := mapCheckToDict(name, check, metric)
			log.Println("metric "+ mapped["metric"] + " of "+ mapped["measurement"]+ " with tags hostname="+ mapped["hostname"]+ " and source="+ mapped["source"])
			if mapped != nil {
				queue <- MoveDataJob{source, destination, mapped, name, check, metric}
			}
		}
	}
	for i := 0; i < 16; i++ {
		cmds <- "done"
	}
}


func main() {
	if source, err := client.NewHTTPClient(client.HTTPConfig{
		Addr: "http://localhost:8086",
	}) ; err == nil {
		if dest, err := client.NewHTTPClient(client.HTTPConfig{
			Addr: "http://localhost:8087",
		}) ; err == nil {
			query := client.Query{
				Command: "SHOW MEASUREMENTS",
				Database: "icinga",
			}
			hosts, err := source.Query(query)
			if err != nil {
				log.Fatalln("Error: ", err)
				return
			}
			for _, row := range hosts.Results[0].Series[0].Values {
				host := row[0].(string)
				found := false
				for _, stuff := range newfangledStuff {
					if (stuff == host) {
						found = true
						break
					}
				}
				if !found {
					log.Print("Processing host " + host)
					processHost(host, source, dest)
				}
			}
		} else {
			log.Fatalln("Error: ", err)
		}
	} else {
		log.Fatalln("Error: ", err)
	}
	fmt.Println("")
}