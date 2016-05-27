# Icinga

Configure icinga for SOSETH use. Please do not update the config on the master node
manually (icinga2 node ... or icinga2 repository ...) as this role takes a different
approach to configuring stuff: Each client nodes saves all enabled checks as fact
in /etc/ansible/facts.d, which is supposed to be read in before calling this role.
You may need to manually gather facts for this to work, depending on your setup.
