import { configureStore } from "@reduxjs/toolkit";
import snapshotsReducer, {
  fetchSnapshots,
  setSelected,
  addSnapshot,
  clearError,
  setError,
} from "../snapshotsSlice";
import { api } from "@/lib/api";

jest.mock("@/lib/api");
const mockApi = api as jest.Mocked<typeof api>;

function makeStore() {
  return configureStore({ reducer: { snapshots: snapshotsReducer } });
}

describe("snapshotsSlice — initial state", () => {
  it("has empty list, no loading, no selection", () => {
    const { snapshots } = makeStore().getState();
    expect(snapshots.list).toEqual([]);
    expect(snapshots.loading).toBe(false);
    expect(snapshots.selected).toBe("");
    expect(snapshots.error).toBe("");
  });
});

describe("snapshotsSlice — sync actions", () => {
  it("setSelected updates selected", () => {
    const store = makeStore();
    store.dispatch(setSelected("snap1"));
    expect(store.getState().snapshots.selected).toBe("snap1");
  });

  it("addSnapshot prepends to list and selects it", () => {
    const store = makeStore();
    store.dispatch(addSnapshot({ name: "s1", filename: "s1.csv" }));
    expect(store.getState().snapshots.list).toHaveLength(1);
    expect(store.getState().snapshots.selected).toBe("s1");
  });

  it("addSnapshot prepends (newest first)", () => {
    const store = makeStore();
    store.dispatch(addSnapshot({ name: "s1", filename: "s1.csv" }));
    store.dispatch(addSnapshot({ name: "s2", filename: "s2.csv" }));
    expect(store.getState().snapshots.list[0].name).toBe("s2");
  });

  it("setError and clearError round-trip", () => {
    const store = makeStore();
    store.dispatch(setError("something went wrong"));
    expect(store.getState().snapshots.error).toBe("something went wrong");
    store.dispatch(clearError());
    expect(store.getState().snapshots.error).toBe("");
  });
});

describe("snapshotsSlice — fetchSnapshots thunk", () => {
  it("sets loading true while pending", () => {
    const store = makeStore();
    mockApi.getSnapshots.mockReturnValueOnce(new Promise(() => {})); // never resolves
    store.dispatch(fetchSnapshots());
    expect(store.getState().snapshots.loading).toBe(true);
  });

  it("populates list and auto-selects first on success", async () => {
    const snaps = [
      { name: "a", filename: "a.csv" },
      { name: "b", filename: "b.csv" },
    ];
    mockApi.getSnapshots.mockResolvedValueOnce(snaps);
    const store = makeStore();
    await store.dispatch(fetchSnapshots());
    const { list, selected, loading } = store.getState().snapshots;
    expect(list).toEqual(snaps);
    expect(selected).toBe("a");
    expect(loading).toBe(false);
  });

  it("does not override an existing selection on re-fetch", async () => {
    const store = makeStore();
    store.dispatch(setSelected("b"));
    mockApi.getSnapshots.mockResolvedValueOnce([
      { name: "a", filename: "a.csv" },
      { name: "b", filename: "b.csv" },
    ]);
    await store.dispatch(fetchSnapshots());
    expect(store.getState().snapshots.selected).toBe("b");
  });

  it("sets error on rejection", async () => {
    mockApi.getSnapshots.mockRejectedValueOnce(new Error("Network error"));
    const store = makeStore();
    await store.dispatch(fetchSnapshots());
    const { error, loading } = store.getState().snapshots;
    expect(error).toBe("Network error");
    expect(loading).toBe(false);
  });
});
