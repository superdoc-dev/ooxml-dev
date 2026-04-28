---
layout: Conceptual
title: '[MS-OI29500]: Part 1 Section 21.1.2.3.5, hlinkClick (Click Hyperlink) | Microsoft Learn'
canonicalUrl: https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/a65b76db-6abc-4989-8cd1-baa9a3500f6f
ms.service: openspecs-office
ROBOTS: INDEX, FOLLOW
uhfHeaderId: MSDocsHeader-OpenSpecs
ms.topic: reference
ms.author: cindyle
protocol_rendering: true
description: a.   The standard states that the action attribute of the hlinkClick, hlinkHover and hlinkMouseOver elements may use an
locale: en-us
author: mrsgit09
document_id: 9981ffaf-cc9e-4255-2d8b-e06b99ae1346
document_version_independent_id: fb9c7683-519d-c8c0-56db-6fe524b62286
updated_at: 2024-11-12T17:35:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/open_specs_office/blob/live/documentation/office_standards/MS-OI29500/a65b76db-6abc-4989-8cd1-baa9a3500f6f.md
gitcommit: https://github.com/MicrosoftDocs/open_specs_office/blob/e2c20ea0c0daef720bc9a4b27e735040c7411bd1/documentation/office_standards/MS-OI29500/a65b76db-6abc-4989-8cd1-baa9a3500f6f.md
git_commit_id: e2c20ea0c0daef720bc9a4b27e735040c7411bd1
site_name: Docs
depot_name: MSDN.open_specs_office
page_type: conceptual
toc_rel: toc.json
feedback_system: None
feedback_product_url: ''
feedback_help_link_type: ''
feedback_help_link_url: ''
word_count: 526
asset_id: office_standards/ms-oi29500/a65b76db-6abc-4989-8cd1-baa9a3500f6f
moniker_range_name: 
monikers: []
item_type: Content
source_path: documentation/office_standards/MS-OI29500/a65b76db-6abc-4989-8cd1-baa9a3500f6f.md
cmProducts: []
platformId: 9aa821c4-3a71-871a-cb0c-49fb8137c140
---

# [MS-OI29500]: Part 1 Section 21.1.2.3.5, hlinkClick (Click Hyperlink) | Microsoft Learn

a. *The standard states that the action attribute of the hlinkClick, hlinkHover and hlinkMouseOver elements may use an unrestricted string.*

PowerPoint reserves the following values for the action attribute:

| Value | Description |
| --- | --- |
| ppaction://customshow?id=SHOW\_ID | Specifies that the link shall launch a custom show from the custShowLst element ("[\[ISO/IEC-29500-1\]](https://go.microsoft.com/fwlink/?LinkId=132464) §19.2.1.7; custShowLst (List of Custom Shows)"). The SHOW\_ID variable shall be replaced with the custom show id as specified in the custShow element ("[ISO/IEC-29500-1] §19.2.1.6; custShow (Custom Show)"). |
| ppaction://customshow?id=SHOW\_ID&return=true | Specifies that the link shall launch a custom show from the custShowLst element ("[ISO/IEC-29500-1] §19.2.1.7; custShowLst (List of Custom Shows)"). After the end of the custom show, viewing of this presentation package shall resume. The SHOW\_ID variable shall be replaced with the custom show id as specified in the custShow element ("[ISO/IEC-29500-1] §19.2.1.6; custShow (Custom Show)"). |
| ppaction://hlinkfile | Specifies that the link shall open a file external to this presentation package. The r:id attribute for this element specifies the corresponding relationship containing the reference to the external file. |
| ppaction://hlinkpres?slideindex=SLIDE\_NUM | Specifies that the link shall launch a presentation external to this presentation package. The r:id attribute for this element specifies the corresponding relationship containing the reference to the external file. The SLIDE\_NUM variable shall be replaced with a slide number in the external presentation that the viewing shall be started on. |
| ppaction://hlinkshowjump?jump=endshow | Specifies that the link shall end the presentation. |
| ppaction://hlinkshowjump?jump=firstslide | Specifies that the link shall target the viewing of the first slide within this presentation package. |
| ppaction://hlinkshowjump?jump=lastslide | Specifies that the link shall target the viewing of the last slide within this presentation package. |
| ppaction://hlinkshowjump?jump=lastslideviewed | Specifies that the link shall target the viewing of the slide previously visited within this presentation package. |
| ppaction://hlinkshowjump?jump=nextslide | Specifies that the link shall target the viewing of the next slide within this presentation package. |
| ppaction://hlinkshowjump?jump=previousslide | Specifies that the link shall target the viewing of the previous slide within this presentation package. |
| ppaction://hlinkshowjump?jump=SLIDE\_NUM | Specifies that the link shall target the viewing of the slide in within this presentation package specified by SLIDE\_NUM. The SLIDE\_NUM variable shall be replaced with a slide number in this presentation package that will be targeted. |
| ppaction://hlinksldjump | Specifies that the link shall target the viewing of a specific slide within this presentation package. The r:id attribute for this element specifies the corresponding relationship containing the reference to the slide part which shall be viewed. |
| ppaction://macro?name=MACRO\_NAME | Specifies that the link shall run a macro contained within this presentation. The MACRO\_NAME variable shall be replaced with the name of the macro module. |
| ppaction://program | Specifies that the link shall run an application external to this presentation package. The r:id attribute for this element specifies the corresponding relationship containing the reference to the application. |
| ppaction://noaction | This value of the action attribute does not specify any action performed by the link. The link will continue to respect highlight attribute and snd element if present. |
| ppaction://media | Specifies that the link shall initiate playback of the media object specified by the parent element. |
| ppaction://ole?verb=OLE\_VERB\_INDEX | Specifies that the link shall execute the verb on an OLE object specified by OLE\_VERB\_INDEX. The OLE\_VERB\_INDEX variable shall be replaced with the verb number of the verb registered by the OLE object that shall be executed. |