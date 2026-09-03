Generated: 2026-09-03 16:14:40 +10:00

Specification file: `/Users/liammclennan/code/system-specification-tool/test/guess-demo-node/specification/specification.md`

# Number Guessing Game

**Verification status:** failed

**Content:**

The system should prompt the user to guess a number that has been randomly generated. It should provide feedback on their guesses until they guess the correct number.

## Evaluation

**Verification status:** unverified

**Claims:**

- **unverified** — If the user's guess is equal to the answer then the feedback is `Correct!`
- **unverified** — If the user's guess is lower than the answer then the feedback is `Higher`
- **unverified** — If the user's guess is higher than the answer then the feedback is `Lower`
- **unverified** — Guessing `42` is always correct

## User input

**Verification status:** failed

**Claims:**

- **failed** — The user must enter a valid, whole number
- **verified** — The user must enter a number that is greater than or equal to the minimum value (`1`) and less than or equal to the maximum value (`10`)

**Content:**

The computer chooses a number, within a range (`[1,10]`) and prompts the user to guess the number.
