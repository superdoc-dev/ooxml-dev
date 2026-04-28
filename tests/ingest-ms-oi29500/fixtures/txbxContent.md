---
layout: Conceptual
title: '[MS-OI29500]: Part 4 Section 14.9.1.1, txbxContent (Rich Text Box Content Container) | Microsoft Learn'
canonicalUrl: https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/dc83bfa3-db21-4eb4-b3c0-63b11f2575d3
ms.service: openspecs-office
ROBOTS: INDEX, FOLLOW
uhfHeaderId: MSDocsHeader-OpenSpecs
ms.topic: reference
ms.author: cindyle
protocol_rendering: true
description: For additional notes that apply to this portion of the standard, please see the notes for oMath, §22.1.2.77(f);
locale: en-us
author: mrsgit09
document_id: f71f7bb0-2de6-3875-fc7b-516e1cf8545a
document_version_independent_id: 5eab6c79-f29b-bcd4-fd50-f996a6ab48e8
updated_at: 2024-04-16T19:01:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/open_specs_office/blob/live/documentation/office_standards/MS-OI29500/dc83bfa3-db21-4eb4-b3c0-63b11f2575d3.md
gitcommit: https://github.com/MicrosoftDocs/open_specs_office/blob/1d95c2713e0344aa1c45f84961cd8691f6e12270/documentation/office_standards/MS-OI29500/dc83bfa3-db21-4eb4-b3c0-63b11f2575d3.md
git_commit_id: 1d95c2713e0344aa1c45f84961cd8691f6e12270
site_name: Docs
depot_name: MSDN.open_specs_office
page_type: conceptual
toc_rel: toc.json
feedback_system: None
feedback_product_url: ''
feedback_help_link_type: ''
feedback_help_link_url: ''
word_count: 103
asset_id: office_standards/ms-oi29500/dc83bfa3-db21-4eb4-b3c0-63b11f2575d3
moniker_range_name: 
monikers: []
item_type: Content
source_path: documentation/office_standards/MS-OI29500/dc83bfa3-db21-4eb4-b3c0-63b11f2575d3.md
cmProducts: []
platformId: 1a6da451-763c-397a-6242-3699234fdb5d
---

# [MS-OI29500]: Part 4 Section 14.9.1.1, txbxContent (Rich Text Box Content Container) | Microsoft Learn

- *For additional notes that apply to this portion of the standard, please see the notes for *[oMath, §22.1.2.77(f)](ab7a0345-712e-4eef-9bcc-80c37e68d9bb)*; *[oMathPara, §22.1.2.78(c)](23e0c1c9-4abb-4c75-acc2-7583040e774d)*.*

a. *The standard states that text box content can be placed inside endnotes, footnotes, comments, or other textboxes.*

    - Word does not allow textbox content inside endnotes, footnotes, comments, or other textboxes.

b. *The standard specifies this element as part of the WordprocessingML namespace.*

    - Word will save an mce choice for VML content. txbxContent elements written in that choice will be written in with a namespace value of http://schemas.microsoft.com/office/word/2006/wordml.
    - This note applies to the following products: Office 2013 Client (Strict), Office 2013 Server (Strict).