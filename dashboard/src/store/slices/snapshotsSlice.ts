import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { api, Snapshot } from "@/lib/api";

interface SnapshotsState {
  list:      Snapshot[];
  loading:   boolean;
  archiving: boolean;
  error:     string;
  selected:  string;
}

const initialState: SnapshotsState = {
  list:      [],
  loading:   false,
  archiving: false,
  error:     "",
  selected:  "",
};

export const fetchSnapshots = createAsyncThunk<Snapshot[], void, { rejectValue: string }>(
  "snapshots/fetch",
  async (_, { rejectWithValue }) => {
    try {
      return await api.getSnapshots();
    } catch (e) {
      return rejectWithValue(e instanceof Error ? e.message : "Erreur de chargement");
    }
  }
);

const snapshotsSlice = createSlice({
  name: "snapshots",
  initialState,
  reducers: {
    setSelected(state, action: PayloadAction<string>) {
      state.selected = action.payload;
    },
    setArchiving(state, action: PayloadAction<boolean>) {
      state.archiving = action.payload;
    },
    addSnapshot(state, action: PayloadAction<Snapshot>) {
      state.list.unshift(action.payload);
      state.selected = action.payload.name;
    },
    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    clearError(state) {
      state.error = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSnapshots.pending, (state) => {
        state.loading = true;
        state.error = "";
      })
      .addCase(fetchSnapshots.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
        if (action.payload.length > 0 && !state.selected) {
          state.selected = action.payload[0].name;
        }
      })
      .addCase(fetchSnapshots.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Erreur inconnue";
      });
  },
});

export const { setSelected, setArchiving, addSnapshot, setError, clearError } =
  snapshotsSlice.actions;
export default snapshotsSlice.reducer;
