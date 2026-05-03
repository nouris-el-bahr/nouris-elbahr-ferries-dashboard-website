import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { api, ResultFile } from "@/lib/api";

export type ResultFilter = "all" | "payment" | "sales";

interface ResultsState {
  list:    ResultFile[];
  loading: boolean;
  error:   string;
  filter:  ResultFilter;
}

const initialState: ResultsState = {
  list:    [],
  loading: false,
  error:   "",
  filter:  "all",
};

export const fetchResults = createAsyncThunk<ResultFile[], void, { rejectValue: string }>(
  "results/fetch",
  async (_, { rejectWithValue }) => {
    try {
      return await api.getResults();
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }
);

const resultsSlice = createSlice({
  name: "results",
  initialState,
  reducers: {
    setFilter(state, action: PayloadAction<ResultFilter>) {
      state.filter = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchResults.pending, (state) => {
        state.loading = true;
        state.error   = "";
      })
      .addCase(fetchResults.fulfilled, (state, action) => {
        state.loading = false;
        state.list    = action.payload;
      })
      .addCase(fetchResults.rejected, (state, action) => {
        state.loading = false;
        state.error   = action.payload ?? "Erreur inconnue";
      });
  },
});

export const { setFilter } = resultsSlice.actions;
export default resultsSlice.reducer;
