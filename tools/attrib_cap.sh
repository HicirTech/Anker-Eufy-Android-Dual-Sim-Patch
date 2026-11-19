#!/system/bin/sh
# Samples per-rmnet TX packet deltas + foreground activity every 2s for ~100s,
# to attribute which Eufy component broadcasts on the SIM2 IMS interface.
out=/data/local/tmp/attrib_cap.txt
: > "$out"
echo "=== iface -> subId map ===" >> "$out"
dumpsys connectivity 2>/dev/null | grep -oE 'InterfaceName: rmnet_data[0-9]+ LinkAddresses: \[[^]]*\]|mSubId = [0-9]+' >> "$out"
echo "=== ip -o -4 addr ===" >> "$out"
ip -o -4 addr | grep rmnet >> "$out"
pid=$(pidof com.oceanwing.battery.cam)
echo "=== app pid $pid thread names ===" >> "$out"
for t in /proc/$pid/task/*/comm; do printf '%s ' "$(cat $t 2>/dev/null)"; done >> "$out" 2>/dev/null
echo >> "$out"
echo "=== samples: time | top-activity-tail | per-rmnet tx-pkt delta ===" >> "$out"
# prime counters
for i in 1 2 3 4 5 6 7 8; do eval "p$i=0"; done
end=$(( $(date +%s) + 100 ))
first=1
while [ "$(date +%s)" -lt "$end" ]; do
  act=$(dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity | grep -oE 'oceanwing[^ }]*' | sed 's/.*\.//')
  line="$(date +%T) ${act:-<other>}"
  i=0
  for dev in rmnet_data0 rmnet_data1 rmnet_data2 rmnet_data7 rmnet_data8; do
    i=$((i+1))
    cur=$(awk -v d="$dev:" '$1==d{print $11}' /proc/net/dev)
    cur=${cur:-0}
    eval "prev=\$p$i"
    [ "$first" = 1 ] && d=0 || d=$((cur-prev))
    eval "p$i=$cur"
    line="$line | $dev +$d"
  done
  echo "$line" >> "$out"
  first=0
  sleep 2
done
echo "=== done ===" >> "$out"
