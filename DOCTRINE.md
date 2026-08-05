# Council doctrine — provenance for training-recommendation constants

This is the reference for *why* the Council's numbers are what they are. It exists
so any math/science in the code is traceable to a source, and so the numbers that
are **not** science-backed are labelled honestly as game-design choices rather
than dressed up as evidence.

Distilled from a two-pass literature review (meta-analyses / systematic reviews
first, verbatim-quoted, adversarially audited for overreach). Every DOI in §3 was
checked against the CrossRef registry and resolves to a real article.

## The standard

> The Council states what it knows, keeps uncertainty visible, and does not
> pretend unsupported constants are science.

Concretely: where evidence supports a *modality-level* suggestion, cite it; where
a value is a game-design choice, say so. HRV is a **conservative context signal**,
never clearance or diagnosis; readiness is collected but currently unread by the
Council. The literature's main contribution was
*subtraction* — it ruled out false precision (see §2) more than it supplied
formulae.

## 1. Provenance of each constant

| Constant (current value) | What it decides | Status |
| --- | --- | --- |
| Weekly rhythm targets | Sessions/week per modality | **Citable — consensus** (WHO 2020, ACSM 2011). Tag as *consensus recommendation, not measured optimum.* |
| Cross-modal suggestion on plateau | Offer strength to an endurance focus | **Citable** (Held 2026; Llanos-Lagos 2024/2025). Wording must be "same miles, cheaper" — economy/performance, **not** VO2max. |
| "Compare HRV to own rolling baseline; ease off below it" | Suppress hard work | **Citable as convention** (Manresa-Rocamora 2021). Measured morning-on-waking; baseline usually mean−1SD. |
| No universal 10%/week progression cap | (a rule deliberately NOT built) | **Citable** (Buist 2008 RCT; Damsted 2018 review). |
| No ACWR "safe zone" | (a rule deliberately NOT built) | **Citable** (Qin 2025; Dalen-Lorentsen 2021; Maupin 2020). |
| HRV/RHR quantiles 0.25 / 0.75; 14–28 day window | "Low HRV / high resting HR" | Design choice, *adjacent to* the mean−1SD convention (0.16 pct). Label as such. |
| `LOWER_BODY_SET_GATE = 6`; 48 h window | Block hard lower-body | **Design choice — no source.** |
| Endurance duration multipliers 0.75 / 1.0 / 1.35 / 2.0 | Workout durations | **Design choice.** The literature declines to supply a defensible progression *rate* — do not fabricate one. |
| Readiness (collected; no cutoff) | No current Council decision | Stored during wellness sync but currently unread by the Council. |
| Lift schemes (4×low / 3×high / 3×mid) | strength / volume / circuit | Weakly grounded — periodization schemes are ~equivalent (Harries 2015; Grgic 2017). |
| Kettlebell specifics | KB quests | **Design choice — zero usable literature exists.** |

Honest end state: cite what's citable; label the rest as deliberate design. Some
rows (the progression *rate*) probably *cannot* be cited because the evidence
doesn't exist — that labelling is the point, not a gap.

## 2. Two design consequences worth remembering

- **The endurance targets are a mirror, not a ladder.** They scale the player's
  own rolling median, so they track a plateau rather than break it. A true
  monotonic ladder is deferred to post-v1 *because the literature gives no
  trustworthy rate* — building one now would mean inventing the number. Ship the
  honest chooser; document the limitation.
- **The HRV gate does not make training better.** Three of four reviews found
  HRV-guided ≈ fixed prescription for performance. It is used only to decide
  whether to *offer* hard work today. Code/comments must not imply it improves
  outcomes.

## 3. Verified sources (all DOIs confirmed via CrossRef)

**Progression rate / injury — what NOT to encode**
- Buist I, et al. 2008. *No effect of a graded training program on the number of
  running-related injuries in novice runners: a RCT.* Am J Sports Med 36(1):33-9.
  DOI 10.1177/0363546507307505. — 532-runner RCT; 10% rule gave identical injury
  rates (20.8% vs 20.3%, P=.90).
- Damsted C, et al. 2018. *Is there evidence for an association between changes in
  training load and running-related injuries? A systematic review.* Int J Sports
  Phys Ther 13(6):931-942. PMCID PMC6253751. — explicitly no support for the 10% rule.
- Qin W, Li R, Chen L. 2025. *ACWR for predicting sports injury risk: SR & meta-
  analysis.* BMC Sports Sci Med Rehabil 17:285. DOI 10.1186/s13102-025-01332-x. —
  0.8–1.3 "safe zone" self-described as unreliable (CI [0.14, 0.94]).
- Dalen-Lorentsen T, et al. 2021. *A Cherry, Ripe for Picking: the ACWR and health
  problems.* JOSPT 51(4):162-173. DOI 10.2519/jospt.2021.9893. — findings depend
  on methodological choices (only 21% of 108 analyses significant).
- Maupin D, et al. 2020. *The relationship between ACWR and injury risk in sports:
  a systematic review.* Open Access J Sports Med 11:51-75. DOI 10.2147/OAJSM.S231405.
  — meta-analysis not feasible; mathematical coupling confound.

**Resistance periodization — scheme is not the lever**
- Harries SK, et al. 2015. *SR & meta-analysis of linear and undulating periodized
  resistance training on strength.* J Strength Cond Res 29(4):1113-25.
  DOI 10.1519/JSC.0000000000000712. — no significant LP vs UP difference (17 studies).
- Grgic J, et al. 2017. *Linear vs daily-undulating periodization on hypertrophy.*
  PeerJ 5:e3695. DOI 10.7717/peerj.3695. — Cohen's d = −0.02 (equivalence).
- Hickmott LM, et al. 2022. *Load and volume autoregulation on strength and
  hypertrophy.* Sports Med - Open 8. DOI 10.1186/s40798-021-00404-9.

**Autoregulation / HRV-guided**
- Medellín Ruiz JP, et al. 2020. *HRV-guided vs predefined training.* Applied
  Sciences 10(23):8532. DOI 10.3390/app10238532. — "did not provide significant
  benefit over PT."
- Manresa-Rocamora A, et al. 2021. *HRV-guided training for cardiac-vagal
  modulation, aerobic fitness, endurance.* IJERPH 18. DOI 10.3390/ijerph181910299.
  — documents the baseline-comparison rule shape and morning-measurement convention.
- Granero-Gallegos A, et al. 2020. *HRV-based training for VO2max.* IJERPH 17.
  DOI 10.3390/ijerph17217999. — positive outlier; treat cautiously (I²=94%).

**Concurrent / strength-for-endurance — the plateau answer**
- Held S, et al. 2026. *Maximizing adaptations in concurrent training: an umbrella
  review.* Sports Med 56(6):1489-1512. DOI 10.1007/s40279-026-02401-y.
- Huiberts RO, et al. 2023. *Concurrent strength and endurance training: impact of
  sex and training status.* Sports Med 54. DOI 10.1007/s40279-023-01943-9.
- Llanos-Lagos C, et al. 2024. *Strength training methods on distance runners'
  performance.* Sports Med 54. DOI 10.1007/s40279-024-02018-z. — combined methods
  improve performance/economy (fragile: k=6, I²=67%, publication bias).
- Llanos-Lagos C, et al. 2025. *Heavy strength training on endurance cyclist
  performance.* Eur J Appl Physiol 126. DOI 10.1007/s00421-025-05883-2. — improves
  performance/efficiency, **not** VO2max (p≥0.263).

**Generalized dose — consensus, not measured optima**
- Garber CE, et al. (ACSM Position Stand) 2011. *Quantity and quality of exercise…*
  Med Sci Sports Exerc 43(7):1334-59. DOI 10.1249/MSS.0b013e318213fefb.
- WHO. 2020. *Guidelines on physical activity and sedentary behaviour.* (GRADE-graded.)

**Too thin to encode — background only**
- Faggian S, et al. 2025. *Sport climbing performance determinants.* J Sport Health
  Sci 14. DOI 10.1016/j.jshs.2024.100974.
- Stien N, et al. 2023. *Climbing- and resistance-training on climbing performance.*
  Biology of Sport 40(1):179-191. DOI 10.5114/biolsport.2023.113295.
- Sanchez X, et al. 2019. *Parameters that predict sport climbing performance.*
  Front Psychol 10:1294. DOI 10.3389/fpsyg.2019.01294.
- Ardavani A, et al. 2021. *Indicators of response to exercise training.* BMJ Open
  11. DOI 10.1136/bmjopen-2020-044676.

## 4. Where these constants live (as shipped, v0.19.0)

Verified present in the merged code, so the table above stays checkable:

| Constant | Module |
| --- | --- |
| `LOWER_BODY_SET_GATE = 6` | `app/counsel_context_model.py` |
| `ACTIVITY_LOOKBACK_DAYS` | `app/counsel_context_model.py` (re-exported by `app/counsel_context.py`) |
| `TREND_PRIOR_MINIMUM = 14` | `app/counsel_rules.py` |
| `TREND_PRIOR_LIMIT = 28` | `app/counsel_wellness.py` |
| HRV/RHR quantiles 0.25 / 0.75 | `app/counsel_rules.py` (`_nearest_rank`) |
| endurance multipliers (0.75, 1.0, …) | `app/quests.py` (`build_endurance_candidates`) |

If you change a value here, change this document in the same commit — an
unsourced number that drifts from its rationale is how the science becomes a
black box again.

## 5. Completed follow-ups

1. **Focus filtering.** The charter narrows a giver's practiced paths without
   gating an otherwise valid offer.
2. **Equipment awareness.** A same-day Iron override narrows Grunhilda's work to
   the available implement; incompatible doctrines wait without advancing.

Both shipped together: the player may constrain what a giver offers without
inventing work outside qualified history.

---

*This doctrine is the durable extract of a research pass and a long two-agent
review. It exists so that every number in the recommendation engine is either
traceable to a source or honestly labelled a game-design choice. The Hall/Maud
counsel-outcome reflection was deliberately CUT rather than shipped, because
general fitness movement cannot be attributed to a handful of counsel quests —
see `COUNCIL_REDESIGN.md` §7b before anyone rebuilds it.*
