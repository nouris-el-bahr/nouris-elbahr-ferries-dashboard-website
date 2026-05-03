import { configureStore } from "@reduxjs/toolkit";
import resultsReducer, { fetchResults, setFilter } from "../resultsSlice";
import { api } from "@/lib/api";

jest.mock("@/lib/api");
const mockApi = api as jest.Mocked<typeof api>;

function makeStore() {
  return configureStore({ reducer: { results: resultsReducer } });
}

const MOCK_RESULTS = [
  { name: "p1.xlsx", type: "payment" as const, size: 2048,  modified: 1700000000 },
  { name: "s1.xlsx", type: "sales"   as const, size: 1024,  modified: 1700000100 },
];

describe("resultsSlice — initial state", () => {
  it("has correct defaults", () => {
    const { results } = makeStore().getState();
    expect(results.list).toEqual([]);
    expect(results.loading).toBe(false);
    expect(results.filter).toBe("all");
    expect(results.error).toBe("");
  });
});

describe("resultsSlice — setFilter", () => {
  it("updates filter to payment", () => {
    const store = makeStore();
    store.dispatch(setFilter("payment"));
    expect(store.getState().results.filter).toBe("payment");
  });

  it("updates filter to sales", () => {
    const store = makeStore();
    store.dispatch(setFilter("sales"));
    expect(store.getState().results.filter).toBe("sales");
  });
});

describe("resultsSlice — fetchResults thunk", () => {
  it("sets loading while pending", () => {
    const store = makeStore();
    mockApi.getResults.mockReturnValueOnce(new Promise(() => {}));
    store.dispatch(fetchResults());
    expect(store.getState().results.loading).toBe(true);
  });

  it("populates list on success", async () => {
    mockApi.getResults.mockResolvedValueOnce(MOCK_RESULTS);
    const store = makeStore();
    await store.dispatch(fetchResults());
    const { list, loading } = store.getState().results;
    expect(list).toEqual(MOCK_RESULTS);
    expect(loading).toBe(false);
  });

  it("sets error on rejection", async () => {
    mockApi.getResults.mockRejectedValueOnce(new Error("Server down"));
    const store = makeStore();
    await store.dispatch(fetchResults());
    const { error, loading } = store.getState().results;
    expect(error).toBe("Server down");
    expect(loading).toBe(false);
  });
});
