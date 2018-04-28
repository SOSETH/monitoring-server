#!/bin/sh

# Managed by Ansible. Do not edit!

cd /etc/icinga2/ansb-zones.d

# Clear config without resetting permissions
echo > ../zones.conf

for i in * ; do
	echo >> ../zones.conf
	cat "$i" >> ../zones.conf
done
