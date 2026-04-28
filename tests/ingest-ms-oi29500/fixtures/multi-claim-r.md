---
layout: Conceptual
title: '[MS-OI29500]: Part 1 Section 22.1.2.87, r (Run) | Microsoft Learn'
canonicalUrl: https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/a3a6444b-11de-4ac5-81ba-fe03b07f8a45
ms.service: openspecs-office
ROBOTS: INDEX, FOLLOW
uhfHeaderId: MSDocsHeader-OpenSpecs
ms.topic: reference
ms.author: cindyle
protocol_rendering: true
description: For additional notes that apply to this portion of the standard, please see the notes for oMath, §22.1.2.77(c).   a.
locale: en-us
author: mrsgit09
document_id: 5ba26cce-b478-72d6-4cfa-7841408716f7
document_version_independent_id: edc4b383-482f-cded-97ba-bce52e7493cd
updated_at: 2024-04-16T19:01:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/open_specs_office/blob/live/documentation/office_standards/MS-OI29500/a3a6444b-11de-4ac5-81ba-fe03b07f8a45.md
gitcommit: https://github.com/MicrosoftDocs/open_specs_office/blob/1d95c2713e0344aa1c45f84961cd8691f6e12270/documentation/office_standards/MS-OI29500/a3a6444b-11de-4ac5-81ba-fe03b07f8a45.md
git_commit_id: 1d95c2713e0344aa1c45f84961cd8691f6e12270
site_name: Docs
depot_name: MSDN.open_specs_office
page_type: conceptual
toc_rel: toc.json
feedback_system: None
feedback_product_url: ''
feedback_help_link_type: ''
feedback_help_link_url: ''
word_count: 171
asset_id: office_standards/ms-oi29500/a3a6444b-11de-4ac5-81ba-fe03b07f8a45
moniker_range_name: 
monikers: []
item_type: Content
source_path: documentation/office_standards/MS-OI29500/a3a6444b-11de-4ac5-81ba-fe03b07f8a45.md
cmProducts: []
platformId: e1c71707-7ed2-febe-2320-404b01d6159a
---

# [MS-OI29500]: Part 1 Section 22.1.2.87, r (Run) | Microsoft Learn

- *For additional notes that apply to this portion of the standard, please see the notes for *[oMath, §22.1.2.77(c)](ab7a0345-712e-4eef-9bcc-80c37e68d9bb)*.*

a. *The standard allows bold and italic to be set in a math run in the rPr of both Math and WordprocessingML.*

    - If Word reads a math run where bold or italic properties are set in the rPr of WordprocessingML, it ignores those properties during display but then moves them into the Math rPr on save.

b. *The standard allows br elements inside a math object.*

    - Word does not allow br elements inside a math object.

c. *The standard allows cr elements as a child of a math run.*

    - Word does not allow the cr element inside a math run.

d. *The standard allows tab elements as a child of a math run.*

    - Word ignores a tab element if it occurs inside a math run.

e. *The standard does not allow w:ins or w:del elements as a child of a math run.*

    - Word supports the w:ins and w:del elements inside a math run.