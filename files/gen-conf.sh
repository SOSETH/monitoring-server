#!/bin/sh

# Managed by Ansible. Do not edit!

cd /etc/prometheus/conf.d

# Clear config without resetting permissions
echo > ../prometheus.yml

for i in * ; do
	echo >> ../prometheus.yml
	cat "$i" >> ../prometheus.yml
done
