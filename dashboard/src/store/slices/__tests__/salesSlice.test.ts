import { configureStore } from "@reduxjs/toolkit";
import salesReducer, {
  setDownloadDate,
  setVatSuffix,
  setFormat,
  setMode,
  setOnlyCheckedIn,
  setRunning,
  setResult,
  setError,
  clearResult,
} from "../salesSlice";

function makeStore() {
  return configureStore({ reducer: { sales: salesReducer } });
}

describe("salesSlice — initial state", () => {
  it("has correct defaults", () => {
    const { sales } = makeStore().getState();
    expect(sales.downloadDate).toBe("");
    expect(sales.vatSuffix).toBe(". Vat");
    expect(sales.format).toBe("Csv");
    expect(sales.mode).toBe("short");
    expect(sales.onlyCheckedIn).toBe(false);
    expect(sales.running).toBe(false);
    expect(sales.result).toBeNull();
    expect(sales.error).toBe("");
  });
});

describe("salesSlice — form field actions", () => {
  it("setDownloadDate", () => {
    const store = makeStore();
    store.dispatch(setDownloadDate("2025-03-01"));
    expect(store.getState().sales.downloadDate).toBe("2025-03-01");
  });

  it("setVatSuffix", () => {
    const store = makeStore();
    store.dispatch(setVatSuffix(" HT"));
    expect(store.getState().sales.vatSuffix).toBe(" HT");
  });

  it("setFormat", () => {
    const store = makeStore();
    store.dispatch(setFormat("Xlsx"));
    expect(store.getState().sales.format).toBe("Xlsx");
  });

  it("setMode", () => {
    const store = makeStore();
    store.dispatch(setMode("detailed"));
    expect(store.getState().sales.mode).toBe("detailed");
  });

  it("setOnlyCheckedIn", () => {
    const store = makeStore();
    store.dispatch(setOnlyCheckedIn(true));
    expect(store.getState().sales.onlyCheckedIn).toBe(true);
  });
});

describe("salesSlice — async state actions", () => {
  it("setRunning toggles running flag", () => {
    const store = makeStore();
    store.dispatch(setRunning(true));
    expect(store.getState().sales.running).toBe(true);
    store.dispatch(setRunning(false));
    expect(store.getState().sales.running).toBe(false);
  });

  it("setResult stores the files array", () => {
    const store = makeStore();
    const files = [{ name: "r.xlsx", type: "sales" }];
    store.dispatch(setResult(files));
    expect(store.getState().sales.result).toEqual(files);
  });

  it("setError stores the message", () => {
    const store = makeStore();
    store.dispatch(setError("Something failed"));
    expect(store.getState().sales.error).toBe("Something failed");
  });

  it("clearResult resets result and error", () => {
    const store = makeStore();
    store.dispatch(setResult([{ name: "r.xlsx", type: "sales" }]));
    store.dispatch(setError("old error"));
    store.dispatch(clearResult());
    expect(store.getState().sales.result).toBeNull();
    expect(store.getState().sales.error).toBe("");
  });
});
