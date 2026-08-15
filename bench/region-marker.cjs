// Preloaded ONLY into a tier-diagnostic process, never into a measured one.
//
// The tier diagnostic needs to know whether V8 finished optimizing a kernel
// before the timed region started or somewhere in the middle of it, and
// --trace-opt prints events with no idea where the region is. Every workload
// opens and closes its region with exactly two calls to
// `process.hrtime.bigint()` — t0 and t1 — so wrapping that call prints the two
// boundaries into the same stdout stream the trace goes to, in order.
//
// This is why the diagnostic can read the workloads UNMODIFIED. A `tiers` mode
// written into all thirteen would be thirteen copies of a timed region that is
// not the timed region being measured.
//
//   node --trace-opt --trace-deopt --require bench/region-marker.cjs \
//        bench/spread.js spread 10000 incl 2 1
let calls = 0;
const real = process.hrtime.bigint;
process.hrtime.bigint = function () {
  calls++;
  if (calls === 1) process.stdout.write('[[region begin]]\n');
  else if (calls === 2) process.stdout.write('[[region end]]\n');
  return real.call(process.hrtime);
};
