#!/system/bin/sh
# Samples the Eufy app's sockets (uid 10411) while its process is alive, for at most $1 seconds.
out=/data/local/tmp/eufy_cap.txt
: > "$out"
end=$(( $(date +%s) + ${1:-360} ))
echo "start $(date +%T)" >> "$out"
ip -o -4 addr >> "$out"
while [ "$(date +%s)" -lt "$end" ]; do
  if [ -n "$(pidof com.oceanwing.battery.cam)" ]; then
    t=$(date +%T)
    for f in udp udp6 tcp tcp6; do
      awk -v t="$t" -v f="$f" '$8 == 10411 { print t, f, $2, $3, $4, $10 }' /proc/net/$f
    done >> "$out"
  fi
  sleep 0.4
done
echo "end $(date +%T)" >> "$out"
