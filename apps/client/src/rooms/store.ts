// Whether the room browser (S7-88) is open. Tiny and always loaded, so the main menu can open it;
// the dialog itself is a lazy chunk (`RoomBrowserHost`, extras route).
import { create } from 'zustand';

type RoomBrowserStore = {
  open: boolean;
  show(): void;
  hide(): void;
};

export const useRoomBrowser = create<RoomBrowserStore>((set) => ({
  open: false,
  show() {
    set({ open: true });
  },
  hide() {
    set({ open: false });
  },
}));
