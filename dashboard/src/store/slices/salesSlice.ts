import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RunOutput } from "@/lib/api";

interface SalesState {
  downloadDate:  string;
  vatSuffix:     string;
  format:        string;
  mode:          string;
  onlyCheckedIn: boolean;
  running:       boolean;
  result:        RunOutput[] | null;
  error:         string;
}

const initialState: SalesState = {
  downloadDate:  "",
  vatSuffix:     ". Vat",
  format:        "Csv",
  mode:          "short",
  onlyCheckedIn: false,
  running:       false,
  result:        null,
  error:         "",
};

const salesSlice = createSlice({
  name: "sales",
  initialState,
  reducers: {
    setDownloadDate(state, action: PayloadAction<string>)   { state.downloadDate  = action.payload; },
    setVatSuffix(state, action: PayloadAction<string>)      { state.vatSuffix     = action.payload; },
    setFormat(state, action: PayloadAction<string>)         { state.format        = action.payload; },
    setMode(state, action: PayloadAction<string>)           { state.mode          = action.payload; },
    setOnlyCheckedIn(state, action: PayloadAction<boolean>) { state.onlyCheckedIn = action.payload; },
    setRunning(state, action: PayloadAction<boolean>)       { state.running       = action.payload; },
    setResult(state, action: PayloadAction<RunOutput[]>)    { state.result        = action.payload; },
    setError(state, action: PayloadAction<string>)          { state.error         = action.payload; },
    clearResult(state) {
      state.result = null;
      state.error  = "";
    },
  },
});

export const {
  setDownloadDate, setVatSuffix, setFormat, setMode, setOnlyCheckedIn,
  setRunning, setResult, setError, clearResult,
} = salesSlice.actions;
export default salesSlice.reducer;
