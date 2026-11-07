import type { HouseholdInput, Household } from '../types/models';
export const petOptions = ['Dogs', 'Cats', 'Birds', 'Rabbits', 'Other'] as const;
export type PetCounts = Record<typeof petOptions[number], number>;
export function initialPets(household?: Household | null): { counts: PetCounts; other: string } {
  const counts: PetCounts = { Dogs: 0, Cats: 0, Birds: 0, Rabbits: 0, Other: 0 };
  let other = '';
  if (household?.petDetails) {
    for (const pet of household.petDetails) {
      const option = petOptions.find(option => option !== 'Other' && option.toLowerCase() === pet.kind.toLowerCase());
      if (option) counts[option] += pet.count;
      else { counts.Other += pet.count; other = [other, pet.kind].filter(Boolean).join(', '); }
    }
  } else if (household?.pets) {
    // Preserve legacy free-text descriptions without guessing how many of each animal there were.
    const option = petOptions.find(option => option !== 'Other' && option.toLowerCase().replace(/s$/, '') === household.petTypes.trim().toLowerCase().replace(/s$/, ''));
    if (option) counts[option] = household.pets;
    else { counts.Other = household.pets; other = household.petTypes || 'Other pets'; }
  }
  return { counts, other };
}
export function summarizePets(counts: PetCounts, other: string): Pick<HouseholdInput, 'pets' | 'petTypes' | 'petDetails'> {
  const petDetails = petOptions.filter(option => counts[option] > 0).map(option => ({ kind: option === 'Other' ? other.trim() : option, count: counts[option] }));
  return { petDetails, pets: petDetails.reduce((total, pet) => total + pet.count, 0), petTypes: petDetails.map(pet => `${pet.count} ${pet.kind.toLowerCase()}`).join(', ') };
}
export function peopleError(people: number, children: number): string {
  if (!Number.isInteger(people) || people < 1 || people > 60) return 'Enter 1–60 people, including children.';
  if (!Number.isInteger(children) || children < 0 || children > people) return 'Children must be a whole number between 0 and the household total.';
  return '';
}
