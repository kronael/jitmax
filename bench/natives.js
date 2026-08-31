// The ONLY file in this project that contains V8 natives syntax, and the only
// reason anything here is still JavaScript: `%Foo()` is a parse error for both
// tsc and node's type stripper, so a file carrying it cannot be TypeScript.
//
// Wrappers, NOT `eval`. An eval'd natives call is a different thing for V8 to
// execute, in the two files whose whole job is observing what V8 does. A
// function call is not: `%GetOptimizationStatus` reports on the function it is
// GIVEN, and its topmost-frame bits are set only when a frame of that same
// function is on the stack (v8src/src/runtime/runtime-test.cc:988-1011), so the
// wrapper's own frame is not observable. `%HaveSameMap` and `%HasFastProperties`
// read the objects they are given and nothing about the caller. The outputs of
// both probes were captured before and after this file existed and compared.
//
// Every caller needs --allow-natives-syntax; without it these are parse errors
// at load. bench/natives.d.ts is what tsc reads instead of this file.
export const optimizationStatus = (fn) => %GetOptimizationStatus(fn);
export const haveSameMap = (a, b) => %HaveSameMap(a, b);
export const hasFastProperties = (o) => %HasFastProperties(o);
