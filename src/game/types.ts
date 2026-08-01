export type GameId = 'space-flyer'

/** Thin contract so a second minigame can plug into the same shell later. */
export type Minigame = {
  id: GameId
}
