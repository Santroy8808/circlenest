# Theta-Comm libsignal release review

Theta-Comm V2 currently pins Signal's official Java/Android artifacts at `0.94.2`.
Signal publishes these artifacts under AGPL-3.0. The dependency provides the audited
PQXDH and Double Ratchet implementation required by the product security design.

Before a public Play Store release, Theta-Space must complete and record:

1. Legal confirmation that the planned Theta-Comm source distribution and network
   service comply with AGPL-3.0.
2. Third-party notices and an accessible corresponding-source offer for the exact
   distributed application version.
3. U.S. and destination-country encryption export review. Signal identifies the
   library as ECCN 5D002.C.1 and describes its License Exception ENC eligibility.
4. A repeatable software-composition scan against the release AAB.

This review is a release gate. It does not justify replacing libsignal with custom
cryptography.
