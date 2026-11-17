/** One current load owns readiness. Invalidated or failed generations cannot reopen it. */
export type SupplyLoadState<T> =
  | { generation: number; status: "loading" | "error"; data: null }
  | { generation: number; status: "ready"; data: T };

export function createSupplyLoadGate<T>() {
  let state: SupplyLoadState<T> = { generation: 0, status: "loading", data: null };
  return {
    read: () => state,
    begin(): SupplyLoadState<T> {
      state = { generation: state.generation + 1, status: "loading", data: null };
      return state;
    },
    succeed(generation: number, data: T): SupplyLoadState<T> | null {
      if (generation !== state.generation || state.status !== "loading") return null;
      state = { generation, status: "ready", data };
      return state;
    },
    fail(generation: number): SupplyLoadState<T> | null {
      if (generation !== state.generation || state.status === "error") return null;
      state = { generation, status: "error", data: null };
      return state;
    },
    updateReady(generation: number, update: (data: T) => T): SupplyLoadState<T> | null {
      if (generation !== state.generation || state.status !== "ready") return null;
      state = { ...state, data: update(state.data) };
      return state;
    },
    /** Cleanup invalidates pending callbacks without publishing React state. */
    dispose(): void {
      state = { generation: state.generation + 1, status: "loading", data: null };
    },
  };
}
