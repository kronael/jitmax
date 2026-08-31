// What the author wrote, and the only file a run of the tool scans here.
// dist/ holds what two real transforms made of it, and a profile's frames
// point INTO those: an `enum` cannot run under type stripping, so this file
// needs a transform to run at all, and transforming moves every line below
// the enum (BUGS TC-77). The interface and the type alias are erased
// entirely, which is what moves the lines up rather than down.
//
// dist/work.js and its .map: tsc --sourceMap --outDir dist --rootDir src
//   --target es2022 --module esnext src/work.ts
// dist/transform.js: stripTypeScriptTypes(this, { mode: 'transform',
//   sourceMap: true, sourceUrl: '../src/work.ts' }) — Node's own transform,
//   map inline. dist/unmapped.js is that output with the comment removed.
// Editing this file means regenerating all four.
export var Unit = /*#__PURE__*/ function(Unit) {
    Unit[Unit["Cent"] = 1] = "Cent";
    Unit[Unit["Dollar"] = 100] = "Dollar";
    return Unit;
}({});
/**
 * Double the rows and keep the large ones.
 *
 * This doc comment is here because it is where the untranslated frame lands.
 * TC-77 was reported with V8 pointing at a line of somebody's prose.
 */ export function kernel(rows, unit) {
    return rows.map((r)=>r * unit).filter((r)=>r > 10);
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy93b3JrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLHlFQUF5RTtBQUN6RSwwRUFBMEU7QUFDMUUsNEVBQTRFO0FBQzVFLDJFQUEyRTtBQUMzRSxxRUFBcUU7QUFDckUsK0RBQStEO0FBQy9ELEVBQUU7QUFDRix5RUFBeUU7QUFDekUsZ0RBQWdEO0FBQ2hELHFFQUFxRTtBQUNyRSw0RUFBNEU7QUFDNUUsMEVBQTBFO0FBQzFFLGlEQUFpRDtBQUNqRCxPQUFPLElBQUEsQUFBSyw4QkFBQTs7O1dBQUE7TUFHWDtBQVFEOzs7OztDQUtDLEdBQ0QsT0FBTyxTQUFTLE9BQU8sSUFBYyxFQUFFLElBQVU7SUFDL0MsT0FBTyxLQUFLLEdBQUcsQ0FBQyxDQUFDLElBQU0sSUFBSSxNQUFNLE1BQU0sQ0FBQyxDQUFDLElBQU0sSUFBSTtBQUNyRCJ9