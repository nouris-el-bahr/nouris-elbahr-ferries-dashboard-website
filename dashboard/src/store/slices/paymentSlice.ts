import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RunOutput } from "@/lib/api";

interface PaymentState {
  factDate:    string;
  periodStart: string;
  periodEnd:   string;
  running:     boolean;
  result:      RunOutput[] | null;
  error:       string;
}

const initialState: PaymentState = {
  factDate:    "",
  periodStart: "",
  periodEnd:   "",
  running:     false,
  result:      null,
  error:       "",
};

const paymentSlice = createSlice({
  name: "payment",
  initialState,
  reducers: {
    setFactDate(state, action: PayloadAction<string>)    { state.factDate    = action.payload; },
    setPeriodStart(state, action: PayloadAction<string>) { state.periodStart = action.payload; },
    setPeriodEnd(state, action: PayloadAction<string>)   { state.periodEnd   = action.payload; },
    setRunning(state, action: PayloadAction<boolean>)    { state.running     = action.payload; },
    setResult(state, action: PayloadAction<RunOutput[]>) { state.result      = action.payload; },
    setError(state, action: PayloadAction<string>)       { state.error       = action.payload; },
    clearResult(state) {
      state.result = null;
      state.error  = "";
    },
  },
});

export const {
  setFactDate, setPeriodStart, setPeriodEnd,
  setRunning, setResult, setError, clearResult,
} = paymentSlice.actions;
export default paymentSlice.reducer;
