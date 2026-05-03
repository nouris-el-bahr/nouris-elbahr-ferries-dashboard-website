import { configureStore } from "@reduxjs/toolkit";
import paymentReducer, {
  setFactDate,
  setPeriodStart,
  setPeriodEnd,
  setRunning,
  setResult,
  setError,
  clearResult,
} from "../paymentSlice";

function makeStore() {
  return configureStore({ reducer: { payment: paymentReducer } });
}

describe("paymentSlice — initial state", () => {
  it("has correct defaults", () => {
    const { payment } = makeStore().getState();
    expect(payment.factDate).toBe("");
    expect(payment.periodStart).toBe("");
    expect(payment.periodEnd).toBe("");
    expect(payment.running).toBe(false);
    expect(payment.result).toBeNull();
    expect(payment.error).toBe("");
  });
});

describe("paymentSlice — date field actions", () => {
  it("setFactDate", () => {
    const store = makeStore();
    store.dispatch(setFactDate("2025-04-15"));
    expect(store.getState().payment.factDate).toBe("2025-04-15");
  });

  it("setPeriodStart", () => {
    const store = makeStore();
    store.dispatch(setPeriodStart("2025-03-01"));
    expect(store.getState().payment.periodStart).toBe("2025-03-01");
  });

  it("setPeriodEnd", () => {
    const store = makeStore();
    store.dispatch(setPeriodEnd("2025-03-31"));
    expect(store.getState().payment.periodEnd).toBe("2025-03-31");
  });
});

describe("paymentSlice — async state actions", () => {
  it("setRunning toggles running flag", () => {
    const store = makeStore();
    store.dispatch(setRunning(true));
    expect(store.getState().payment.running).toBe(true);
    store.dispatch(setRunning(false));
    expect(store.getState().payment.running).toBe(false);
  });

  it("setResult stores the files array", () => {
    const store = makeStore();
    const files = [{ name: "facture.xlsx", type: "payment" }];
    store.dispatch(setResult(files));
    expect(store.getState().payment.result).toEqual(files);
  });

  it("setError stores the message", () => {
    const store = makeStore();
    store.dispatch(setError("Snapshot introuvable"));
    expect(store.getState().payment.error).toBe("Snapshot introuvable");
  });

  it("clearResult resets result and error together", () => {
    const store = makeStore();
    store.dispatch(setResult([{ name: "f.xlsx", type: "payment" }]));
    store.dispatch(setError("old error"));
    store.dispatch(clearResult());
    expect(store.getState().payment.result).toBeNull();
    expect(store.getState().payment.error).toBe("");
  });
});
