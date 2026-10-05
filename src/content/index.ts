import balance from './balance.json';
import kids from './kids.json';
import personality from '../../assets/data/personality_v1.json';
import recipes from './recipes.json';
import type { Balance, Content, KidDef, Personality, RecipeDef } from './types';

export const content: Content = {
  kids: kids as KidDef[],
  recipes: recipes as RecipeDef[],
  // JSON imports widen tuples to arrays; validateContent checks the shape in CI.
  balance: balance as unknown as Balance,
  // Codex's writing and each type's two foods (D-058); validateContent checks every type has them.
  personality: personality.types as Record<string, Personality>,
};
