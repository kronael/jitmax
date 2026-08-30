/** @jitmax */
function gather(xs) {
  let acc = [];
  for (const x of xs) acc = [...acc, x];
  return acc;
}

module.exports = { gather };
