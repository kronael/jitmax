# What V8's source says about each rule

Every rule in this project carries a benchmark: a number measured on one
machine, and the case where the same benchmark found nothing. This file is the
second, independent kind of evidence — the mechanism, traced to the engine's own
source, so a reader can check the claim without trusting the harness.

The two answer different questions and neither substitutes for the other:

- A benchmark says **what it cost here**. It cannot say why.
- A citation says **what mechanism exists**. It cannot say what it costs.

**A constant in V8's source is a hypothesis about cost, never a measurement.**
That is SPEC §12's rule and it governs this file too. Where the source says
nothing, this file says the source says nothing — "silent" is a result, not a
gap to be filled with a plausible-sounding citation.

`make v8-check` verifies every quoted line below against the pinned checkout and
fails with the drifted line when V8 moves. It exits non-zero when `v8src/` is
absent rather than reporting success: a check that passes when it cannot look is
the failure this project exists to prevent.

## The pin

```pin
revision = c635f0d160b6e988b5ea5a907511a2929beb5d5e
version = 15.3.0.0
```

`v8src/` is a sparse checkout of github.com/v8/v8 — `src` and `include` only,
96 MB, gitignored. The pinned revision is dated 2026-08-10 and
`include/v8-version.h` reports 15.3.0.0 with `V8_IS_CANDIDATE_VERSION 1`. To
reproduce it:

```sh
git clone --filter=blob:none --sparse https://github.com/v8/v8 v8src
git -C v8src sparse-checkout set src include
git -C v8src checkout c635f0d160b6e988b5ea5a907511a2929beb5d5e
```

**This is not the V8 the benchmarks ran on.** Every measurement in `SPEC.md` §3
was taken on Node v22.23.2, V8 12.4.254.21-node.56. The mechanisms below are
long-lived — the four-map budget, elements kinds, dictionary mode and the
inlining budget all predate both versions — but no line here was read in the
engine that produced the numbers, and nothing here should be read as though it
were.

## Summary

| rule | mechanism in V8 | primary citation | source vs. benchmark |
|---|---|---|---|
| `boxed-elements` | elements kinds; a non-number stored into a double array forces the general kind, whose elements are tagged pointers | `objects/elements-kind.h:105`, `objects/lookup.cc:446` | mechanism supported, **trigger not supported**, cost silent |
| `megamorphic-elements` | the fourth map fills the IC's polymorphic budget; the fifth makes the site megamorphic | `flags/flag-definitions.h:3320`, `ic/ic.cc:802` | supported, cost silent |
| `megamorphic-dispatch` | a call slot holds ONE target; the receiver-map budget governs the method load, not the call | `builtins/ic-callable.tq:104` | **contradicts the threshold for one form** |
| `accumulating-spread` | none — quadratic work is quadratic on any engine | — | no mechanism to cite |
| `allocating-select` | escape analysis removes an allocation only when it can see it, within a 1300-byte budget | `compiler/escape-analysis.cc:302` | partly supported, cost silent |
| `chained-allocation` | each stage allocates its own result array; `Object.entries` allocates two objects per key | `builtins/array-map.tq:101`, `objects/objects-inl.h:1182` | supported, cost silent |
| `delete-property` | a named `delete` normalizes a fast object unconditionally, and nothing puts it back | `objects/lookup.cc:840` | supported, cost silent, **number predates the protocol** |
| `closed-world` | bytecode length and a statically known target gate inlining | `objects/shared-function-info-inl.h:437` | supports the benchmark, **silent on the rule's trigger** |

## `boxed-elements`

**What the rule claims.** An array parameter whose element type is a union
mixing primitives cannot keep its elements unboxed, so every read becomes a load
plus a dereference. Measured at 1.45-1.89x on reads, 2.36-3.28x with
construction — one sweep, unreplicated.

**What the source shows.** V8 tags every array with an elements kind. Three fast
families exist, and only one of them holds raw doubles:

`src/objects/elements-kind.h:105`

```cpp
enum ElementsKind : uint8_t {
  // The "fast" kind for elements that only contain SMI values. Must be first
  // to make it possible to efficiently check maps for this kind.
  PACKED_SMI_ELEMENTS,
  HOLEY_SMI_ELEMENTS,

  // The "fast" kind for tagged values. Must be second to make it possible to
  // efficiently check maps for this and the PACKED_SMI_ELEMENTS kind
  // together at once.
  PACKED_ELEMENTS,
  HOLEY_ELEMENTS,

  // The "fast" kind for unwrapped, non-tagged double values.
  PACKED_DOUBLE_ELEMENTS,
  HOLEY_DOUBLE_ELEMENTS,
```

The kind is decided by the values stored, one value at a time. A Smi asks for
`PACKED_SMI_ELEMENTS`, a heap number for `PACKED_DOUBLE_ELEMENTS`, and anything
else falls through to the general kind:

`src/objects/objects-inl.h:699`

```cpp
// static
ElementsKind Object::OptimalElementsKind(Tagged<Object> obj) {
  if (IsSmi(obj)) return PACKED_SMI_ELEMENTS;
  Tagged<HeapObject> heap_object = Cast<HeapObject>(obj);
  if (IsHeapNumber(heap_object)) return PACKED_DOUBLE_ELEMENTS;
```

On a store, the array's kind is joined with the new value's optimal kind and the
array transitions if they differ:

`src/objects/lookup.cc:446`

```cpp
  if (IsElement(*holder)) {
    DirectHandle<JSObject> holder_obj = Cast<JSObject>(holder);
    ElementsKind kind = holder_obj->GetElementsKind();
    ElementsKind to = Object::OptimalElementsKind(*value);
    if (IsHoleyElementsKind(kind)) to = GetHoleyElementsKind(to);
    to = GetMoreGeneralElementsKind(kind, to);

    if (kind != to) {
      JSObject::TransitionElementsKind(isolate(), holder_obj, to);
    }
```

The join only ever moves toward the more general kind:

`src/objects/map.cc:1156`

```cpp
  bool allow_store_transition = IsTransitionElementsKind(from_kind);
  // Only store fast element maps in ascending generality.
  if (IsFastElementsKind(to_kind)) {
    allow_store_transition =
        allow_store_transition && IsTransitionableFastElementsKind(from_kind) &&
        IsMoreGeneralElementsKindTransition(from_kind, to_kind);
  }
```

And the double-to-general transition is the expensive one: it walks the backing
store and allocates a `HeapNumber` for every element that is not a Smi.

`src/objects/elements.cc:356`

```cpp
  while (offset < copy_size) {
    HandleScope scope(isolate);
    offset += 100;
    for (uint32_t i = offset - 100; i < offset && i < copy_size; ++i) {
      DirectHandle<Object> value =
          FixedDoubleArray::get(*from, i + from_start, isolate);
      to->set(i + to_start, *value, UPDATE_WRITE_BARRIER);
    }
  }
```

**What this proves, and what it does not.** It proves the mechanism the rule
names is real: an array that holds a string as well as numbers cannot be a
`FixedDoubleArray`, and its numbers become heap objects reached through a
pointer. It proves nothing about the size of that cost — 1.45-1.89x is the
harness's number and the source has no opinion on it.

**And it does not support the rule's trigger.** V8 keys the elements kind on the
values actually stored (`objects-inl.h:699`, above); TypeScript keys the rule on
the declared type. A `(number | string)[]` that only ever holds numbers stays
`PACKED_DOUBLE_ELEMENTS` and pays nothing. This is TC-2's defect in a second
rule — the declared type is an upper bound on what the engine will see, not a
description of it. Recorded in `BUGS.md` TC-14, along with the fact that this
rule's benchmark cannot be re-run from this repository.

## `megamorphic-elements`

**What the rule claims.** A load site that sees five maps goes megamorphic;
measured at 3.6-10.6x on reads, against 1.2-2.0x for two to four shapes.

**What the source shows.** The budget is a named constant with the value 4:

`src/flags/flag-definitions.h:3320`

```cpp
#define DEFAULT_MAX_POLYMORPHIC_MAP_COUNT 4
DEFINE_INT(max_valid_polymorphic_map_count, DEFAULT_MAX_POLYMORPHIC_MAP_COUNT,
           "maximum number of valid maps to track in POLYMORPHIC state")
```

`IC::UpdatePolymorphicIC` refuses to add a fifth map to the cache:

`src/ic/ic.cc:798`

```cpp
  int number_of_maps = static_cast<int>(maps_and_handlers.size());
  int number_of_valid_maps =
      number_of_maps - deprecated_maps - (handler_to_overwrite != -1);

  if (number_of_valid_maps >= v8_flags.max_valid_polymorphic_map_count) {
    return false;
  }
  if (deprecated_maps >= v8_flags.max_valid_polymorphic_map_count) {
    return false;
  }
```

That refusal is what makes the site megamorphic. `IC::PatchCache` flushes the
maps it had cached into the global stub cache and sets the feedback slot:

`src/ic/ic.cc:1030`

```cpp
      if (!is_keyed() || state() == RECOMPUTE_HANDLER) {
        CopyICToMegamorphicCache(name);
      }
      [[fallthrough]];
    case MEGADOM:
      ConfigureVectorState(MEGAMORPHIC, name);
      [[fallthrough]];
    case MEGAMORPHIC:
      UpdateMegamorphicCache(lookup_start_object_map(), name, handler);
```

After which a load is a hash-table probe rather than a cached handler:

`src/ic/stub-cache.h:15`

```cpp
// The stub cache is used for megamorphic property accesses.
// It maps (map, name, type) to property access handlers. The cache does not
// need explicit invalidation when a prototype chain is modified, since the
// handlers verify the chain.
```

And the optimizing compiler stops building a map-checked access at all. Maglev
emits a call to the megamorphic IC builtin instead:

`src/maglev/maglev-graph-builder.cc:4745`

```cpp
  } else if (feedback.maps().empty()) {
    // The IC is megamorphic.

    // We can't do megamorphic loads for lookups where the lookup start isn't
    // the receiver (e.g. load from super).
    if (receiver != lookup_start_object) return {};

    // Use known possible maps if we have any.
    MapInference inference(this, lookup_start_object, MapInference::kOnlyFresh);
    // Require fresh maps here to avoid overeager speculation.
    auto possible_maps = inference.TryGetPossibleMaps();
    if (possible_maps.has_value()) {
      // Map checks are inserted below independently.
      inferred_maps = *possible_maps;
    } else {
      // If we have no known maps, make the access megamorphic.
      switch (access_mode) {
        case compiler::AccessMode::kLoad:
          return BuildCallBuiltinWithTaggedInputs<Builtin::kLoadIC_Megamorphic>(
              {receiver, GetConstant(feedback.name())}, feedback_source);
```

**What this proves, and what it does not.** It proves the threshold: four is a
constant in the engine, the fifth map is refused, and the consequences (stub
cache probe, no inlined access) are in the source. It does not prove the 3.6-10.6x
— that is the benchmark's, and the two evidences agree only on where the step
is, not on how tall it is. It also does not close TC-2: the source counts *maps*,
the rule counts *union members*, and those are different quantities.

## `megamorphic-dispatch`

**What the rule claims.** A method called on a receiver that unions five object
types goes megamorphic at the call site. Measured at 14.6-20.0x on reads for a
prototype method, 1.16-1.56x at four shapes.

**What the source shows — and this is the one place the source and the rule
disagree.** A call site's feedback slot does not hold maps at all. It holds one
target function, as a weak reference:

`src/builtins/ic-callable.tq:14`

```torque
macro IsMonomorphic(feedback: MaybeObject, target: JSAny): bool {
  return IsWeakReferenceToObject(feedback, target);
}
```

`CollectCallFeedback` has exactly three outcomes: the same target again,
already-megamorphic, or uninitialized:

`src/builtins/ic-callable.tq:104`

```torque
  try {
    const feedback: MaybeObject =
        LoadFeedbackVectorSlot(feedbackVector, slotId);
    if (IsMonomorphic(feedback, maybeTarget)) return;
    if (IsMegamorphic(feedback)) return;
    if (IsUninitialized(feedback)) goto TryInitializeAsMonomorphic;
```

There is no polymorphic tier. A second, different target goes straight to the
megamorphic sentinel, and the only escape is two closures that share one
`FeedbackCell` — that is, two instantiations of the same function literal:

`src/builtins/ic-callable.tq:45`

```torque
macro TransitionToMegamorphic(
    implicit context: Context)(feedbackVector: FeedbackVector,
    slotId: uintptr): void {
  StoreFeedbackVectorSlot(feedbackVector, slotId, kMegamorphicSymbol);
  ReportFeedbackUpdate(feedbackVector, slotId, 'Call:TransitionMegamorphic');
}
```

So the four-map budget quoted in the rule's message governs the *load* of the
method — `x.step` is a property access, and `ic.cc:802` above is what caps it —
while the *call* has a budget of one.

**What this proves, and what it does not.** It proves the rule's own sweep read
the engine correctly. `bench/dispatch.jsonl` split the call site into halves and
found K maps with one shared function keeping the four-map budget (2.14-2.21x at
four, 6.92-8.25x at five) while one map with K functions had no threshold at all
(7.68-11.93x, flat from the second target to the sixth). That is exactly this
source: the map budget on the load, no budget on the call.

It also means **the shipped threshold of five is wrong in one direction for one
form**. When every object carries its own function, the cliff is at the second
target, and the rule does not fire until the fifth. It is a miss, not a false
positive, and nothing in a declared type separates a prototype method from a
closure in a field — which is why the rule stays at five rather than guessing.
`BUGS.md` TC-13 holds the proposal; this citation is the second, independent
reason to believe it.

The source is silent on the magnitude, as always: 14.6-20.0x is the harness's.

## `accumulating-spread`

**There is no V8 mechanism to cite, and inventing one would be worse than
having none.** This rule's cost is a complexity class. Rebuilding an
accumulator from a copy of itself copies everything it already holds, so a loop
that does it n times performs n²/2 element copies. That is arithmetic. It is
true of every engine, every version, and every implementation strategy; no
constant, threshold, bailout or transition in V8 is involved, and none is
responsible for the 156-2348x this project measured.

The only thing the source adds is that each pass really is a full copy rather
than something cleverer. `acc.concat(v)` sizes its result to the sum of the
inputs and copies into it:

`src/builtins/builtins-array.cc:1746`

```cpp
      // The Array length is guaranteed to be <= kHalfOfMaxInt thus we won't
      // overflow.
      result_len += Smi::ToUInt(array->length());
      // Throw an Error if we overflow the FixedArray limits
      if (FixedDoubleArray::kMaxLength < result_len ||
          FixedArray::kMaxLength < result_len) {
        AllowGarbageCollection gc;
        THROW_NEW_ERROR(isolate,
                        NewRangeError(MessageTemplate::kInvalidArrayLength));
      }
    }
  }
  return ElementsAccessor::Concat(isolate, args, n_arguments, result_len);
```

**What this proves, and what it does not.** It proves one pass copies the whole
accumulator. It does not prove the rule — the rule follows from that fact by
multiplication, not from anything V8 chose. This is the one rule whose cost
would survive an engine rewrite, and it is also the largest effect in the
project. That is not a coincidence.

## `allocating-select`

**What the rule claims.** `x = f(..., x, ...)` in a loop, where `f` returns an
object, allocates on every pass including the passes that choose the value `x`
already held. Measured at 2.65-2.73x when the chosen value outlives the loop,
and 1.72-2.28x when it is kept in a local — the second cell exists because the
first objection anyone raises is "escape analysis will delete that allocation".

**What the source shows.** Escape analysis exists, and the source says exactly
what it can and cannot do. It works on allocations in the compiled graph, node
by node, and anything it does not understand escapes everything it touches:

`src/compiler/escape-analysis.cc:912`

```cpp
    default: {
      // For unknown nodes, treat all value inputs as escaping.
      int value_input_count = op->ValueInputCount();
      for (int i = 0; i < value_input_count; ++i) {
        Node* input = current->ValueInput(i);
        current->SetEscaped(input);
      }
```

Storing a value into an object that has itself escaped marks the value escaped
too — the `else` branch here is the measured "chosen value escapes" case:

`src/compiler/escape-analysis.cc:670`

```cpp
      if (vobject && !vobject->HasEscaped() &&
          vobject->FieldAt(OffsetOfFieldAccess(op)).To(&var) &&
          !FieldAccessOf(op).is_bounded_size_access) {
        current->Set(var, value);
        current->MarkForDeletion();
      } else {
        current->SetEscaped(object);
        current->SetEscaped(value);
      }
```

And the whole analysis is budgeted. Past 1300 tracked bytes it stops creating
virtual objects and everything after that point escapes by default:

`src/compiler/escape-analysis.cc:302`

```cpp
  static constexpr int kTrackingBudget = 1300;

  VirtualObject* NewVirtualObject(int size) {
    if (number_of_tracked_bytes_ + size >= kTrackingBudget) {
      if (V8_UNLIKELY(v8_flags.trace_turbo_bailouts)) {
        std::cout
            << "Bailing out in Escape Analysis because of kTrackingBudget\n";
      }
      return nullptr;
```

**What this proves, and what it does not.** It proves escape analysis is
conditional rather than guaranteed: it is a TurboFan reducer with a budget, it
requires the allocation to be visible in the graph it is analysing, and a store
into an escaped object propagates escape to the value. That is consistent with
the 2.65-2.73x cell, where the chosen value is stored somewhere that outlives
the loop.

It does **not** explain the 1.72-2.28x local cell. Which condition failed there
— the callee not inlined, the budget, the loop's phi structure — is not
established by anything read here, and this project does not guess. The measured
fact stands on its own: the cost survived being kept local.

## `chained-allocation`

**What the rule claims.** Each stage of `xs.map(f).filter(g)` allocates a whole
array that the next stage reads once and discards. Measured at 7.64-7.89x with
construction at n=1000; `Object.entries(o).map(f)` at 3.59x.

**What the source shows.** `Array.prototype.map` builds a fresh `JSArray` for
its result, choosing the elements kind from what the callback returned:

`src/builtins/array-map.tq:101`

```torque
  macro CreateJSArray(implicit context: Context)(validLength: Smi):
      JSArray {
    const length: intptr = this.fixedArray.length_intptr;
    dcheck(Convert<intptr>(validLength) <= length);
    let kind: ElementsKind = ElementsKind::PACKED_SMI_ELEMENTS;
    if (!this.onlySmis) {
      if (this.onlyNumbers) {
        kind = ElementsKind::PACKED_DOUBLE_ELEMENTS;
      } else if (this.onlyNumbersAndUndefined) {
        dcheck(kEnableUndefinedDouble);
        kind = ElementsKind::HOLEY_DOUBLE_ELEMENTS;
      } else {
        kind = ElementsKind::PACKED_ELEMENTS;
      }
    }
```

`filter`'s fast path allocates its own:

`src/builtins/array-filter.tq:140`

```torque
  const newMap: Map =
      LoadJSArrayElementsMap(o.map.elements_kind, LoadNativeContext(context));
  return AllocateJSArray(ElementsKind::PACKED_SMI_ELEMENTS, newMap, len, len);
```

`Object.entries` is the interesting one, because it allocates twice per key — a
two-element `FixedArray` and a `JSArray` wrapping it:

`src/objects/objects-inl.h:1182`

```cpp
inline DirectHandle<Object> MakeEntryPair(Isolate* isolate,
                                          DirectHandle<Object> key,
                                          DirectHandle<Object> value) {
  DirectHandle<FixedArray> entry_storage = isolate->factory()->NewFixedArray(2);
  {
    entry_storage->set(0, *key, SKIP_WRITE_BARRIER);
    entry_storage->set(1, *value, SKIP_WRITE_BARRIER);
  }
  return isolate->factory()->NewJSArrayWithElements(entry_storage,
                                                    PACKED_ELEMENTS, 2);
}
```

**What this proves, and what it does not.** It proves the allocations the rule
names are real and per-stage, and it independently explains why the rule fires
on `Object.entries` and not on `Object.keys`: the entries path allocates two
objects per key that the keys path does not. The measured gap (3.59x for
entries, 0.94x for keys — the keys chain is *faster* than the fused loop) is the
harness's, and the source has no opinion on either number, nor on the washout at
n=100000 where memory bandwidth takes over.

## `delete-property`

**What the rule claims.** `delete o.p` puts its object in dictionary mode.
Quoted at 28-67x per property load.

**What the source shows.** The delete path normalizes a fast object with no
condition beyond "it is fast":

`src/objects/lookup.cc:840`

```cpp
    PropertyNormalizationMode mode =
        is_prototype_map ? KEEP_INOBJECT_PROPERTIES : CLEAR_INOBJECT_PROPERTIES;

    if (holder->HasFastProperties()) {
      JSObject::NormalizeProperties(isolate_, Cast<JSObject>(holder), mode, 0,
                                    "DeletingProperty");
      ReloadPropertyInformation<false>();
    }
    JSReceiver::DeleteNormalizedProperty(holder, dictionary_entry());
```

Normalizing means a new map and a migration of the object to it:

`src/objects/js-objects.cc:3965`

```cpp
void JSObject::NormalizeProperties(Isolate* isolate,
                                   DirectHandle<JSObject> object,
                                   PropertyNormalizationMode mode,
                                   int expected_additional_properties,
                                   bool use_cache, const char* reason) {
  if (!object->HasFastProperties()) return;

  DirectHandle<Map> map(object->map(), isolate);
  DirectHandle<Map> new_map = Map::Normalize(isolate, map, map->elements_kind(),
                                             {}, mode, use_cache, reason);

  JSObject::MigrateToMap(isolate, object, new_map,
                         expected_additional_properties);
}
```

A dictionary-mode receiver then loses inlined property access. Stores are never
inlined; loads only when the object is a prototype and const-tracking is on:

`src/compiler/access-info.cc:49`

```cpp
  // We can only inline accesses to dictionary mode holders if the access is a
  // load and the holder is a prototype. The latter ensures a 1:1
  // relationship between the map and the object (and therefore the property
  // dictionary).
  static_assert(ODDBALL_TYPE == LAST_PRIMITIVE_HEAP_OBJECT_TYPE);
  if (IsBooleanMap(*map.object())) return true;
  if (map.instance_type() < LAST_PRIMITIVE_HEAP_OBJECT_TYPE) return true;
  if (IsJSObjectMap(*map.object())) {
    if (map.is_dictionary_map()) {
      if (!V8_DICT_PROPERTY_CONST_TRACKING_BOOL) return false;
      return access_mode == AccessMode::kLoad &&
             map.object()->is_prototype_map();
    }
```

And a dictionary map that rehashes takes the IC megamorphic outright:

`src/ic/ic.cc:777`

```cpp
        } else if (map->is_dictionary_map()) {
          // If the receiver type is a dictionary map and the handler is
          // different, it means the dictionary rehashed. Go MEGAMORPHIC to
          // prevent deopt loops.
          return false;
```

The "does not move back" half also holds up. `MigrateSlowToFast` exists, but the
only automatic caller for an ordinary object is prototype optimization; every
other call site is `%ToFastProperties`, the API, the bootstrapper or wasm:

`src/objects/js-objects.cc:5094`

```cpp
    if (!V8_DICT_PROPERTY_CONST_TRACKING_BOOL &&
        object->map()->should_be_fast_prototype_map() &&
        !object->HasFastProperties()) {
      JSObject::MigrateSlowToFast(object, 0, "OptimizeAsPrototype");
    }
```

There is no fast path for deleting the most recently added *named* property.
(There is one for the last *element* of a non-array object, in
`FastElementsAccessor::DeleteCommon` — a different mechanism, and not what this
rule fires on.)

**What this proves, and what it does not.** This is the best-supported mechanism
in the project: every named delete on a fast object normalizes it, the
normalized object is excluded from inlined access, and nothing in normal
execution un-normalizes it. The source says the transition always happens.

It says nothing about what the transition costs, and **this project measured
that the transition is not always a cost**: `delete` on a singleton object read
three times measured 0x — dictionary mode up to 10% *faster* — while per-row
deletion over 100k objects measured 28-67x. Both are in SPEC §3. A mechanism
that always fires and a cost that sometimes does not is precisely why a constant
is not a measurement.

**And the number has never been re-run under the current protocol.** 28-67x
comes from `options.md` round 3b, the probe appendix: an ad-hoc median-of-runs
on a noisy VM, taken before `bench/driver.js` existed. It has no fresh-process
pairing, no AB/BA randomization, no bootstrap interval, no rep count, no
checksum, and no `.jsonl` in `bench/`. Every other shipped number in this
project has all six. `BUGS.md` TC-15.

## `closed-world`

**What the rule claims.** A call to a function whose body the checker cannot
read is where the promise stops. The rule quotes 4.42-4.79x, measured on the one
mechanism a call boundary controls: whether V8 inlines the callee
(`bench/inline.js` pads a helper past the inlining budget with dead code).

**What the source shows.** Inlineability is decided per function, and bytecode
length against `max_inlined_bytecode_size` is one of the first gates:

`src/objects/shared-function-info-inl.h:437`

```cpp
  // If there is no bytecode array, the function is not compiled, so we don't
  // want to inline.
  if (!HasBytecodeArray()) return kHasNoBytecode;

  if (GetBytecodeArray(isolate)->length() >
      v8_flags.max_inlined_bytecode_size) {
    return kExceedsBytecodeLimit;
  }
```

That flag is 460 bytes by default, and the comment beside it states what
inlining is worth:

`src/flags/flag-definitions.h:1606`

```cpp
DEFINE_INT(max_inlined_bytecode_size, 460,
           "maximum size of bytecode for a single inlining")
// {max_inlined_bytecode_size_cumulative} and
// {max_inlined_bytecode_size_absolute} are the inlining limits for the regular
// case. By being not too high, we ensure that Turbofan compilation doesn't take
// too long.
// Still, inlining very small functions is usually very beneficial (removes call
// overhead, enable better load elimination and escape analysis, removes heap
// number allocations...), so small functions usually ignore the limits above
// and use {max_inlined_bytecode_size_small_total} instead.
```

The heuristic reports the refusal under `--trace-turbo-inlining`, which is how
`bench/inline.js` confirmed its large variant was really not inlined:

`src/compiler/js-inlining-heuristic.cc:97`

```cpp
  if (!shared.HasBytecodeArray()) {
    TRACE("Cannot consider " << shared << " for inlining (no bytecode)");
    return false;
  }
```

Inlining also requires a statically known target:

`src/compiler/js-inlining.cc:322`

```cpp
// Determines whether the call target of the given call {node} is statically
// known and can be used as an inlining candidate. The {SharedFunctionInfo} of
// the call target is provided (the exact closure might be unknown).
OptionalSharedFunctionInfoRef JSInliner::DetermineCallTarget(Node* node) {
  DCHECK(IrOpcode::IsInlineeOpcode(node->opcode()));
  Node* target = node->InputAt(JSCallOrConstructNode::TargetIndex());
  HeapObjectMatcher match(target);

  // This reducer can handle both normal function calls as well a constructor
  // calls whenever the target is a constant function object, as follows:
  //  - JSCall(target:constant, receiver, args..., vector)
  //  - JSConstruct(target:constant, new.target, args..., vector)
  if (match.HasResolvedValue() && match.Ref(broker()).IsJSFunction()) {
```

**What this proves, and what it does not.** It proves the benchmark measured
what it says it measured: a callee past the bytecode budget is refused, by a
named flag, with a traced reason. `bench/inline.js` already cites
`flag-definitions.h:1606` in its header, so this rule has had both kinds of
evidence longer than any other.

**It is silent on the rule's actual trigger.** The rule fires on a call whose
body *this checker* cannot read; V8's inlining does not care about module
boundaries, package boundaries, or whether TypeScript has the source. A call
into a typed dependency is inlined perfectly well if the callee is small and its
target is known. So the citation supports the *bound* the rule quotes — what an
un-inlined call can cost — and says nothing about whether any particular
unchecked call is un-inlined. That limit is already in the rule's `silent`
field, and this is the source-side statement of the same thing.

## SPEC §12's ten constants, re-checked

All ten were re-read at the pinned revision. **Nine are exact. One was
imprecise** and is corrected here and in SPEC §12: the value 4 lives on
`flag-definitions.h:3320` as `DEFAULT_MAX_POLYMORPHIC_MAP_COUNT`, and the flag
that consumes it is on 3321 — the table cited 3320 for the flag.

Blocks already quoted above are not repeated: `max_valid_polymorphic_map_count`
is in `megamorphic-elements`, `max_inlined_bytecode_size` in `closed-world`.

`src/flags/flag-definitions.h:1618`

```cpp
DEFINE_INT(max_inlined_bytecode_size_absolute, 4600,
           "maximum absolute size of bytecode considered for inlining")
```

`src/flags/flag-definitions.h:1625`

```cpp
DEFINE_INT(max_inlined_bytecode_size_small, 30,
           "maximum size of bytecode considered for small function inlining")
```

`src/flags/flag-definitions.h:1630`

```cpp
DEFINE_INT(max_optimized_bytecode_size, 60 * KB,
           "maximum bytecode size to "
           "be considered for turbofan optimization; too high values may cause "
           "the compiler to hit (release) assertions")
DEFINE_INT(max_maglev_optimized_bytecode_size, 512 * KB,
           "maximum bytecode size to be considered for maglev optimization")
```

`invocation_count_for_maglev` is 400 only off Android; the checkout carries both
branches, and SPEC §12's citation of 1187 is the non-Android one:

`src/flags/flag-definitions.h:1183`

```cpp
#if defined(ANDROID)
DEFINE_INT(invocation_count_for_maglev, 1000,
           "invocation count required for optimizing with Maglev")
#else
DEFINE_INT(invocation_count_for_maglev, 400,
           "invocation count required for optimizing with Maglev")
#endif  // ANDROID
```

`src/flags/flag-definitions.h:1204`

```cpp
DEFINE_INT(invocation_count_for_turbofan, 3000,
           "invocation count required for optimizing with TurboFan")
```

`src/flags/flag-definitions.h:3329`

```cpp
DEFINE_INT(fast_properties_soft_limit, 12,
           "limits the number of properties that can be added to an object "
           "using keyed store before transitioning to dictionary mode")
DEFINE_INT(max_fast_properties, 128,
           "limits the number of mutable properties that can be added to an "
           "object before transitioning to dictionary mode")
```

`fast_properties_soft_limit` is consulted only for a keyed store, which is the
whole reason `o.k = v` never normalizes at any count while `o[k] = v` does —
the effect SPEC §3 measured at 6.17-6.34x and shipped no rule for:

`src/objects/map-inl.h:319`

```cpp
bool Map::TooManyFastProperties(StoreOrigin store_origin) const {
  if (UnusedPropertyFields() != 0) return false;
  if (store_origin != StoreOrigin::kMaybeKeyed) return false;
  if (is_prototype_map()) return false;
  int limit = std::max(
      {v8_flags.fast_properties_soft_limit.value(), GetInObjectProperties()});
  int external =
      NumberOfFields(ConcurrencyMode::kSynchronous) - GetInObjectProperties();
  return external > limit;
```

`src/compiler/globals.h:102`

```cpp
const int kMaxFastLiteralDepth = 3;
```

`src/objects/transitions.h:149`

```cpp
  static const int kMaxNumberOfTransitions = 1024 + 512;
```

`src/objects/js-objects.h:965`

```cpp
  static const int kMaxInstanceSize = 255 * kTaggedSize;
```

`max_fast_properties` (128) still has no use site anywhere in `v8src/src`, as
SPEC §12 says.

## What the two kinds of evidence say to each other

| rule | the source… |
|---|---|
| `boxed-elements` | **supports the mechanism, not the trigger.** Elements kinds are decided by stored values; the rule reads declared types. TC-14. |
| `megamorphic-elements` | **supports it.** The constant is 4, the fifth map is refused, the compiler stops inlining the access. |
| `megamorphic-dispatch` | **contradicts the threshold for one form.** A call slot holds one target; own-function receivers are off the cliff at two, not five. TC-13. |
| `accumulating-spread` | **is silent, and correctly so.** The cost is a complexity class, not an engine behaviour. |
| `allocating-select` | **half-supports it.** Escape analysis is real, budgeted and conditional; why the local cell still cost 1.72-2.28x is not established. |
| `chained-allocation` | **supports it,** including the `entries`/`keys` split the benchmark found. |
| `delete-property` | **supports the mechanism,** and the project's own measurement shows the mechanism is not always a cost. The number predates the current protocol. TC-15. |
| `closed-world` | **supports the benchmark, is silent on the trigger.** V8's inlining does not care what the checker can read. |

Two rules came out of this weaker than they went in, and neither was changed:
`boxed-elements` (TC-14) and `delete-property` (TC-15) are recorded in `BUGS.md`
for the owner to prioritize. This is an evidence pass, not a code pass.
