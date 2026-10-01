import balance from './balance.json';
import kids from './kids.json';
import recipes from './recipes.json';
import type { Balance, Content, KidDef, RecipeDef } from './types';

export const content: Content = {
  kids: kids as KidDef[],
  recipes: recipes as RecipeDef[],
  // JSON imports widen tuples to arrays; validateContent checks the shape in CI.
  balance: balance as unknown as Balance,
};
