"""Varied fictional household profiles for the disposable demo."""

import random
from typing import TypedDict

from haven.openapi import FamilyNeeds, FamilyResourcesResponse


class DemoHousehold(TypedDict):
    adults: int
    children: int
    needs: FamilyNeeds
    resources: FamilyResourcesResponse


def household(
    adults: int,
    children: int,
    *,
    has_car: bool,
    pets: bool = False,
    immediate_medication: bool = False,
    medical_notes: str | None = None,
    accessibility_notes: str | None = None,
    other_special_care: str | None = None,
) -> DemoHousehold:
    return {
        "adults": adults,
        "children": children,
        "needs": {
            "pets": pets,
            "immediate_medication": immediate_medication,
            "medical_notes": medical_notes,
            "accessibility_notes": accessibility_notes,
            "other_special_care": other_special_care,
        },
        "resources": {"has_car": has_car},
    }


def generate_households(count: int, *, seed: int = 42) -> list[DemoHousehold]:
    """Guarantee useful demo examples, then sample and shuffle a broader population.

    The weights deliberately exercise different workflows; they are not census
    estimates. A local RNG keeps the demo reproducible without affecting other code.
    """
    examples = [
        household(
            2,
            2,
            has_car=True,
            pets=True,
            other_special_care="One dog; bringing a crate and pet food.",
        ),
        household(
            1,
            0,
            has_car=False,
            immediate_medication=True,
            medical_notes="Prescription medication running low; needs refill assistance.",
            accessibility_notes="Uses a walker; needs help getting from home to a vehicle.",
        ),
        household(
            1,
            2,
            has_car=False,
            other_special_care="One infant needs formula and diapers; sibling is school age.",
        ),
        household(
            2,
            0,
            has_car=True,
            immediate_medication=True,
            medical_notes="Insulin supply running low; needs refrigeration and refill coordination.",
            accessibility_notes="Uses a manual wheelchair; needs step-free access.",
        ),
        household(1, 0, has_car=True),
        household(2, 0, has_car=False),
    ]
    if count < len(examples):
        raise ValueError(f"At least {len(examples)} households are needed for the demo examples")
    rng = random.Random(seed)
    profiles = examples
    sizes = [
        (1, 0),
        (2, 0),
        (1, 1),
        (1, 2),
        (2, 1),
        (2, 2),
        (2, 3),
        (2, 4),
        (3, 0),
        (3, 2),
        (4, 3),
        (4, 4),
    ]
    size_weights = [20, 22, 8, 6, 12, 15, 6, 3, 3, 3, 1, 1]
    for _ in range(count - len(examples)):
        adults, children = rng.choices(sizes, weights=size_weights)[0]
        has_car = rng.random() < 0.74
        pets = rng.random() < 0.38
        immediate_medication = rng.random() < 0.18
        medical_notes = None
        if immediate_medication:
            medical_notes = rng.choice(
                [
                    "Prescription medication was left behind; needs refill assistance.",
                    "Insulin supply running low; needs refrigeration and refill coordination.",
                    "Rescue inhaler missing; needs medication assistance.",
                    "Seizure medication running low; needs a refill.",
                    "Heart medication left at home; needs refill coordination.",
                ]
            )
        elif rng.random() < 0.10:
            medical_notes = rng.choice(
                [
                    "Has several days of prescribed medication; needs continued access.",
                    "Uses a CPAP device; needs reliable electrical power.",
                    "Home oxygen user; needs power and backup supply coordination.",
                ]
            )
        accessibility_notes = None
        if rng.random() < 0.16:
            accessibility_notes = rng.choice(
                [
                    "Uses a walker; needs help with stairs and long distances.",
                    "Uses a manual wheelchair; needs step-free access and an accessible bathroom.",
                    "Limited mobility after surgery; needs help reaching a vehicle.",
                    "Uses a cane; needs a ground-floor sleeping area.",
                    "Low vision; needs assistance navigating an unfamiliar shelter.",
                    "Hearing impairment; needs written evacuation instructions.",
                ]
            )
        care_notes = []
        if pets:
            care_notes.append(
                rng.choices(
                    [
                        "One dog; bringing a crate and pet food.",
                        "Two cats; bringing carriers and litter.",
                        "One dog and one cat; needs accommodation for both pets.",
                        "Two dogs; needs help arranging pet-friendly transport.",
                    ],
                    weights=[55, 25, 12, 8],
                )[0]
            )
        if rng.random() < 0.12:
            options = [
                "Severe food allergy; needs clearly labeled meals.",
                "Needs a quiet space due to sensory sensitivity.",
                "Needs help charging a powered medical device.",
                "Needs evacuation instructions in Spanish.",
            ]
            if children:
                options.append("Infant in household; needs formula and diapers.")
            care_notes.append(rng.choice(options))
        profiles.append(
            household(
                adults,
                children,
                has_car=has_car,
                pets=pets,
                immediate_medication=immediate_medication,
                medical_notes=medical_notes,
                accessibility_notes=accessibility_notes,
                other_special_care=" ".join(care_notes) or None,
            )
        )
    rng.shuffle(profiles)
    return profiles
