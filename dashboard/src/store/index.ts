import { configureStore } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";
import snapshotsReducer from "./slices/snapshotsSlice";
import paymentReducer   from "./slices/paymentSlice";
import salesReducer     from "./slices/salesSlice";
import resultsReducer   from "./slices/resultsSlice";

export const store = configureStore({
  reducer: {
    snapshots: snapshotsReducer,
    payment:   paymentReducer,
    sales:     salesReducer,
    results:   resultsReducer,
  },
});

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch                    = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
