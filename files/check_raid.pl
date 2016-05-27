#!/usr/bin/perl -w
# vim:ts=4
#
# Check RAID status.  Look for any known types
# of RAID configurations, and check them all.
# Return CRITICAL if in a DEGRADED state, since
# if the whole array has failed you'll have already noticed it!
# Return UNKNOWN if there are no RAID configs that can be found.
# Return WARNING if rebuilding or initialising
#
# S Shipway, university of auckland
#
# Thanks to M Carmier for megaraid section
# Tiny improvement bySteve Shipway and Erwan 'Labynocle' Ben Souiden
#
# Version 1.1 : IPS; Solaris, AIX, Linux software RAID; megaide
# Version 2.0 : Added megaraid, mpt (serveraid), aacli (serveraid)
# Version 2.0.1 : Manage the resync state for mdstat RAID

use strict;
use Getopt::Long;
use vars qw($opt_v $opt_d $opt_h $opt_W $opt_S);
my(%ERRORS) = ( OK=>0, WARNING=>1, CRITICAL=>2, UNKNOWN=>3, WARN=>1, CRIT=>2 );
my($VERSION) = "2.0.1";
my($message, $status);
my(@ignore);
my($SUDO) = "/usr/bin/sudo";

#####################################################################
sub print_usage () {
	print "Usage: check_raid [list of devices to ignore]\n";
	print "       check_raid -v\n";
	print "       check_raid -h\n";
}

sub print_help () {
	print "check_raid, Revision: $VERSION \n";
	print "Copyright (c) 2004-2006 S Shipway
This plugin reports the current server's RAID status
";
	print_usage();
}

#####################################################################
# return true if parameter is not in ignore list
sub valid($) {
	my($v) = $_[0];
	$v = lc $v;
	foreach ( @ignore ) { return 0 if((lc $_) eq $v); }
	return 1;
}
#####################################################################
sub check_metastat {
	my($l,$s,$d,$sd);

	open METASTAT,"/usr/sbin/metastat |" or return;
	while( $l = <METASTAT> ) {
		chomp $l;
		if($l =~ /^(\S+):/) { $d = $1; $sd = ''; next; }
		if($l =~ /Submirror \d+:\s+(\S+)/) { $sd = $1; next; }
		if($l =~ /State: (\S.+)/) { $s = $1;
			if($sd and valid($sd) and valid($d)) {
				if($s =~ /Okay/i) {
					# no worries...
				} elsif($s =~ /Resync/i) {
					$status = $ERRORS{WARNING} if(!$status);
				} else {
					$status = $ERRORS{ERROR};
				}
				$message .= "$d:$sd:$s ";
			}
		}
	}
	close METASTAT;
}
sub check_megaide {
	my($f,$l);
	my($s,$n);
	my($CMD);

	foreach $f ( glob('/proc/megaide/*/status') ) {
		if( -r $f ) { $CMD = "<$f"; }
		else { $CMD = "$SUDO cat $f |"; }
		open MEGAIDE,$CMD or next;
		while( $l = <MEGAIDE> ) {
			if( $l =~ /Status\s*:\s*(\S+).*Logical Drive.*:\s*(\d+)/i ) {
				($s,$n)=($1,$2);
				next if(!valid($n));
				if($s ne 'ONLINE') {
					$status = $ERRORS{CRITICAL};
					$message .= "Megaide:$n:$s ";
				} else {
					$message .= "Megaide:$n:$s ";
				}
				last;
			}
		}
		close MEGAIDE;
	}
}
sub check_mdstat {
	my($l);
	my($s,$n,$f);

	open MDSTAT,"</proc/mdstat" or return;
	while( $l = <MDSTAT> ) {
		if( $l =~ /^(\S+)\s+:/ ) { $n = $1; $f = ''; next; }
		if( $l =~ /(\S+)\[\d+\]\(F\)/ ) { $f = $1; next; }

		if( $l =~ /\s*\[.*resync\s*=\s*([\d\.]+)/ ) {
			$s = $1;
			next if(!valid($n));
			$status = $ERRORS{WARNING} if(!$status);
			$message .= "md:$n:$f:resync ($s\%)";
			next;
		}
		if( $l =~ /\s*.*\[([U_]+)\]/ ) {
			$s = $1;
			next if(!valid($n));
			if($s =~ /_/ ) {
				$status = $ERRORS{CRITICAL};
				$message .= "md:$n:$f:$s ";
			} else {
				$message .= "md:$n:$s ";
			}
		}
	}
	close MDSTAT;
}
sub check_lsraid {
	my($l);
	my($s,$n,$f);

	return if(! -x "/sbin/lsraid");
	open LSRAID,"/sbin/lsraid -A -p 2>/dev/null |" or return;
	while( $l = <LSRAID> ) {
		chomp $l;
		if( $l =~ /\/dev\/(\S+) \S+ (\S+)/ ) {
			($n,$s) = ($1,$2);
			next if(!valid($n));
			if($s =~ /good|online/ ) { # no worries
			} elsif($s =~ /sync/ ) {
				$status = $ERRORS{WARNING} if(!$status);
			} else { $status = $ERRORS{CRITICAL}; }
			$message .= "md:$n:$s ";
		}
	}
	close MDSTAT;
}
sub check_vg {
	my(@vg, $vg);
	my($l,@f);
	my($s,$n,$f);

	return if(! -x "/usr/sbin/lsvg");
	open LSVG,"/usr/sbin/lsvg 2>/dev/null |" or return;
	while( $l = <LSVG> ) { chomp $l; push @vg, $l; }
	close LSVG;
	foreach $vg ( @vg ) {
		next if(!valid($vg)); # skip entire VG
		open LSVG,"/usr/sbin/lsvg -l $vg 2>/dev/null |" or return;
		while( $l = <LSVG> ) {
			@f = split " ",$l;
			($n,$s) = ($f[0],$f[5]);
			next if(!valid($n) or !$s);
			next if( $f[3] eq $f[2] ); # not a mirrored LV
			if( $s =~ /open\/(\S+)/i ) {
				$s = $1;
				if( $s ne 'syncd' ) { $status = $ERRORS{CRITICAL}; }
				$message .= "lvm:$n:$s ";
			}
		}
		close LSVG;
	}
}
sub check_ips {
	my($l,@f);
	my($s,$n,$c);
	my($CMD);

	$CMD = "/usr/local/nrpe/ipssend";
	$CMD = "/usr/local/bin/ipssend" if(-f "/usr/local/bin/ipssend");
	$CMD = "/usr/bin/ipssend" if(-f "/usr/bin/ipssend");
	return if(! -f $CMD);
	$CMD .= " getconfig 1 LD";
	$CMD = "$SUDO $CMD" if( $> );

	open IPS,"$CMD |" or return;
	while( $l = <IPS> ) {
		chomp $l;
		if( $l =~ /drive number (\d+)/i ) { $n = $1; next; }
		next if(!valid($n));
		if( $l =~ /Status .*: (\S+)\s+(\S+)/ ) {
			($s,$c) = ($1,$2);
			if( $c =~ /SYN|RBL/i ) { # resynching
				$status = $ERRORS{WARNING} if(!$status);
			} elsif( $c !~ /OKY/i ) { # not OK
				$status = $ERRORS{CRITICAL};
			}
			$message .= "ips:$n:$s ";
		}
	}
	close IPS;
}
sub check_aaccli {
	my($dsk,$stat);
	my($aaccli)="";
	$aaccli = "/usr/local/nrpe/aaccli" if(-f "/usr/local/nrpe/aaccli");
	$aaccli = "/usr/local/bin/aaccli" if(-f "/usr/local/bin/aaccli");
	$aaccli = "/usr/sbin/aaccli" if(-f "/usr/sbin/aaccli");
	chdir "/tmp";
	if(!$aaccli) { $message .= "aaccli:not_installed "; return; }
	open AACCLI,"|$SUDO $aaccli >/dev/null 2>&1";
	print AACCLI "open aac0\n";
	print AACCLI "logfile start $$.log\n";
	print AACCLI "container list /full\n";
	print AACCLI "logfile end\n";
	print AACCLI "exit\n";
	close AACCLI;
#File foo receiving all output.
#
#AAC0>
#COMMAND: container list /full=TRUE
#Executing: container list /full=TRUE
#Num          Total  Oth Stripe          Scsi   Partition                                       Creation
#Label Type   Size   Ctr Size   Usage   C:ID:L Offset:Size   State   RO Lk Task    Done%  Ent Date   Time
#----- ------ ------ --- ------ ------- ------ ------------- ------- -- -- ------- ------ --- ------ --------
# 0    Mirror 74.5GB            Open    0:02:0 64.0KB:74.5GB Normal                        0  051006 13:48:54
# /dev/sda             Auth             0:03:0 64.0KB:74.5GB Normal                        1  051006 13:48:54
#
#
#AAC0>
#COMMAND: logfile end
#Executing: logfile end
	open STAT,"<$$.log";
	while ( <STAT> ) {
		if( /(\d:\d\d?:\d+)\s+\S+:\S+\s+(\S+)/ ) {
			($dsk,$stat) = ($1,$2);
			next if(!valid($dsk));
			$dsk =~ s/:/\//g;
			next if(!valid($dsk));
			$message .= "aac:$dsk:$stat ";
			$status = $ERRORS{CRITICAL} if($stat eq "Broken");
			$status = $ERRORS{WARNING} if(!$status and $stat eq "Rebuild");
			$status = $ERRORS{WARNING} if(!$status and $stat eq "Bld/Vfy");
			$status = $ERRORS{CRITICAL} if($stat eq "Missing");
			$status = $ERRORS{WARNING} if(!$status and $stat eq "Verify");
			$status = $ERRORS{WARNING} if(!$status and $stat eq "VfyRepl");
		}
	}
	close STAT;
	unlink "$$.log";
}
sub check_afacli {
	$message .= "afacli:not_supported ";
}
sub check_mpt {
	my($cmd) = "/usr/local/nrpe/mpt-status";
	my($dsk,$stat);

	$cmd = "/usr/local/bin/mpt-status" if(-f "/usr/local/bin/mpt-status");
	$cmd = "/usr/bin/mpt-status" if(-f "/usr/bin/mpt-status");
	return if(! -f $cmd);

	open CMD,"$SUDO $cmd|" or return;
	while ( <CMD> ) {
		next if(! /vol_id\s*(\d+).*state\s+(\S+),/ );
		($dsk,$stat) = ($1,$2);
		next if(!valid($dsk));
		$message .= "mpt:$dsk:$stat ";
		if(!$status and $stat =~ /INITIAL|INACTIVE|RESYNC/) {
			$status = $ERRORS{WARNING} ;
		} elsif($stat =~ /DEGRADED/) {
			$status = $ERRORS{CRITICAL} ;
		} elsif(!$status and $stat !~ /ONLINE/) {
			$status = $ERRORS{UNKNOWN} ;
		}
	}
	close CMD;
}
sub check_megaraid {
	my($f,$l);
	my($s,$n);
	my($CMD);

	foreach $f ( glob('/proc/megaraid/*/raiddrives*') ) {
		if( -r $f ) { $CMD = "<$f"; }
		else { $CMD = "$SUDO /bin/cat $f |"; }
		open MEGARAID,$CMD or next;
		while( $l = <MEGARAID> ) {
			if( $l =~ /logical drive\s*:\s*(\d+).*, state\s*:\s*(\S+)/i ) {
				($n,$s)=($1,$2);
				next if(!valid($n));
				if($s ne 'optimal') {
					$status = $ERRORS{CRITICAL};
					$message .= "Megaraid:$n:$s ";
				} else {
					$message .= "Megaraid:$n:$s ";
				}
				last;
			}
		}
		close MEGARAID;
	}
}


###########################################################################
sub sudoers {
	my($f);

	$f = '/usr/local/etc/sudoers';
	$f = '/etc/sudoers' if(! -f $f );
	if(! -f "$f" ) { print "Unable to find sudoers file.\n"; return; }
	if(! -w "$f" ) { print "Unable to write to sudoers file.\n"; return; }

	print "Updating file $f\n";
	open SUDOERS, ">>$f";
	print SUDOERS "ALL  ALL=(root) NOPASSWD:/usr/local/bin/ipssend getconfig 1 LD\n" if( -f "/usr/local/bin/ipssend" );
	print SUDOERS "ALL  ALL=(root) NOPASSWD:/usr/local/bin/aaccli container list /full\n" if( -f "/usr/local/bin/aaccli" );
	print SUDOERS "ALL  ALL=(root) NOPASSWD:/bin/cat /proc/megaide/0/status\n" if( -d "/proc/megaide/0" );
	print SUDOERS "ALL  ALL=(root) NOPASSWD:/bin/cat /proc/megaide/1/status\n" if( -d "/proc/megaide/1" );
	print SUDOERS "ALL  ALL=(root) NOPASSWD:/usr/local/bin/mpt-status\n" if( -d "/proc/mpt" );
	foreach my $mr ( glob('/proc/mega*/*/raiddrives*') ) {
		print SUDOERS "ALL  ALL=(root) NOPASSWD:/bin/cat $mr\n" if( -d $mr );
	}

	close SUDOERS;
	print "sudoers file updated.\n";
}
#####################################################################
$ENV{'BASH_ENV'}='';
$ENV{'ENV'}='';

Getopt::Long::Configure('bundling');
GetOptions
	("v"   => \$opt_v, "version"    => \$opt_v,
	 "h"   => \$opt_h, "help"       => \$opt_h,
	 "d" => \$opt_d, "debug" => \$opt_d,
	 "S" => \$opt_S, "sudoers" => \$opt_S,
	 "W" => \$opt_W, "warnonly" => \$opt_W );

if($opt_S) {
	sudoers;
	exit 0;
}

@ignore = @ARGV if(@ARGV);

if ($opt_v) {
	print "check_raid Revision: $VERSION\n" ;
	exit $ERRORS{'OK'};
}
if ($opt_h) {print_help(); exit $ERRORS{'OK'};}
if($opt_W) {
	$ERRORS{CRITICAL} = $ERRORS{WARNING};
}

$status = $ERRORS{OK}; $message = '';

check_megaide if( -d "/proc/megaide" );           # MegaIDE RAID controller
check_mdstat  if( -f "/proc/mdstat" );            # Linux LVM
check_mpt     if( -d "/proc/mpt"  );              # LSILogic MPT ServeRAID
check_megaraid if( -d "/proc/megaraid"  );        # MegaRAID
check_aaccli  if( -d "/proc/scsi/aacraid"  );     # Adaptec ServeRAID
check_lsraid  if( -x "/sbin/lsraid" );            # Linux, software RAID
check_metastat if( -x "/usr/sbin/metastat" );     # Solaris, software RAID
check_vg      if( -x "/usr/sbin/lsvg" );          # AIX LVM
check_ips     if( -x "/usr/local/bin/ipssend"
					or -x "/usr/bin/ipssend"  );  # Serveraid IPS
check_afacli  if( -x "/usr/local/bin/afacli"
					or -x "/usr/bin/afacli" );    # Adaptec RAID
# Cant do megaRAID controller, it needs X and java (yuck)

if( $message ) {
	if( $status == $ERRORS{OK} ) {
		print "OK: ";
	} elsif( $status == $ERRORS{WARNING} ) {
		print "WARNING: ";
	} elsif( $status == $ERRORS{CRITICAL} ) {
		print "CRITICAL: ";
	}
	print "$message\n";
} else {
	$status = $ERRORS{UNKNOWN};
	print "No RAID configuration found.\n";
}
exit $status;
