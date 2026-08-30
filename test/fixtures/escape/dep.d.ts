// A typed dependency: five classes whose bodies ship as JavaScript the program
// never reads. `isDispatchDecl` is false here — these are declarations in a
// declaration file, not interface members — so every call on one of them is
// closed-world's half of the split, and the count still has to be taken.
export declare class P1 { emit(): number }
export declare class P2 { emit(): number }
export declare class P3 { emit(): number }
export declare class P4 { emit(): number }
export declare class P5 { emit(): number }
