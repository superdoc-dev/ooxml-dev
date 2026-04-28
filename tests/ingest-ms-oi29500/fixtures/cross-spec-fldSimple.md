---
layout: Conceptual
title: '[MS-OI29500]: fldSimple (Ruby Simple Field) | Microsoft Learn'
canonicalUrl: https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/34477fff-355a-497e-a2bf-4b9c3f80b093
ms.service: openspecs-office
ROBOTS: INDEX, FOLLOW
uhfHeaderId: MSDocsHeader-OpenSpecs
ms.topic: reference
ms.author: cindyle
protocol_rendering: true
description: This element specifies the presence of a simple field at the current location in the document. The semantics of this field
locale: en-us
author: mrsgit09
document_id: fc8e7fee-8596-b4b3-9edb-ec18da0b4569
document_version_independent_id: 13c964f5-4784-34a0-5570-29e08e751eb0
updated_at: 2024-08-20T18:25:00.0000000Z
original_content_git_url: https://github.com/MicrosoftDocs/open_specs_office/blob/live/documentation/office_standards/MS-OI29500/34477fff-355a-497e-a2bf-4b9c3f80b093.md
gitcommit: https://github.com/MicrosoftDocs/open_specs_office/blob/89097c23c53300d6a8c590b56f93789334453b20/documentation/office_standards/MS-OI29500/34477fff-355a-497e-a2bf-4b9c3f80b093.md
git_commit_id: 89097c23c53300d6a8c590b56f93789334453b20
site_name: Docs
depot_name: MSDN.open_specs_office
page_type: conceptual
toc_rel: toc.json
feedback_system: None
feedback_product_url: ''
feedback_help_link_type: ''
feedback_help_link_url: ''
word_count: 863
asset_id: office_standards/ms-oi29500/34477fff-355a-497e-a2bf-4b9c3f80b093
moniker_range_name: 
monikers: []
item_type: Content
source_path: documentation/office_standards/MS-OI29500/34477fff-355a-497e-a2bf-4b9c3f80b093.md
cmProducts:
- https://authoring-docs-microsoft.poolparty.biz/devrel/540ac133-a371-4dbb-8f94-28d6cc77a70b
spProducts:
- https://authoring-docs-microsoft.poolparty.biz/devrel/60bfc045-f127-4841-9d00-ea35495a5800
platformId: 1a8fcd5a-33a0-f42c-d729-b04bf2afb956
---

# [MS-OI29500]: fldSimple (Ruby Simple Field) | Microsoft Learn

This element specifies the presence of a simple field at the current location in the document. The semantics of this field are defined via its field codes ("[\[ISO/IEC-29500-1\]](https://go.microsoft.com/fwlink/?LinkId=132464) §17.16.5").

[Example: Consider the following WordprocessingML fragment for a simple field:

    - ```
 <w:fldSimple w:instr="FILENAME">
   <w:r>
     <w:t>Example Document.docx</w:t>
   </w:r>
 </w:fldSimple>
```

The **fldSimple** element defines a *FILENAME* field ("[ISO/IEC-29500-1] §17.16.5.17; FILENAME") using the simple field syntax. The current field result for the field is *Example Document.docx*. end example]

| Parent Elements |
| --- |
| **customXml** (§[3.1.3.1.1, customXml](d188da3e-b34b-4445-b3a0-118155f75ff3)); **fldSimple** (§3.1.3.1.2, fldSimple); **hyperlink** (§[3.1.3.1.3, hyperlink](cc9e4bbd-134f-4d35-b2c7-95fde8c633a7)); **rt** ("[ISO/IEC-29500-1] §17.3.3.24"); **rubyBase** ("[ISO/IEC-29500-1] §17.3.3.27"); **sdtContent** (§[3.1.3.1.7, sdtContent](a3757e69-1f9b-4322-b17e-dee4d308d29e)) |

| Child Elements | Subclause |
| --- | --- |
| **acc** (Accent) | "[ISO/IEC-29500-1] §22.1.2.1" |
| **bar** (Bar) | "[ISO/IEC-29500-1] §22.1.2.7" |
| **bookmarkEnd** (Bookmark End) | "[ISO/IEC-29500-1] §17.13.6.1" |
| **bookmarkStart** (Bookmark Start) | "[ISO/IEC-29500-1] §17.13.6.2" |
| **borderBox** (Border-Box Object) | "[ISO/IEC-29500-1] §22.1.2.11" |
| **box** (Box Object) | "[ISO/IEC-29500-1] §22.1.2.13" |
| **commentRangeEnd** (Comment Anchor Range End) | "[ISO/IEC-29500-1] §17.13.4.3" |
| **commentRangeStart** (Comment Anchor Range Start) | "[ISO/IEC-29500-1] §17.13.4.4" |
| **customXml** (Ruby Inline-Level Custom XML Element) | §3.1.3.1.1, customXml |
| **customXmlDelRangeEnd** (Custom XML Markup Deletion End) | "[ISO/IEC-29500-1] §17.13.5.4" |
| **customXmlDelRangeStart** (Custom XML Markup Deletion Start) | "[ISO/IEC-29500-1] §17.13.5.5" |
| **customXmlInsRangeEnd** (Custom XML Markup Insertion End) | "[ISO/IEC-29500-1] §17.13.5.6" |
| **customXmlInsRangeStart** (Custom XML Markup Insertion Start) | "[ISO/IEC-29500-1] §17.13.5.7" |
| **customXmlMoveFromRangeEnd** (Custom XML Markup Move Source End) | "[ISO/IEC-29500-1] §17.13.5.8" |
| **customXmlMoveFromRangeStart** (Custom XML Markup Move Source Start) | "[ISO/IEC-29500-1] §17.13.5.9" |
| **customXmlMoveToRangeEnd** (Custom XML Markup Move Destination Location End) | "[ISO/IEC-29500-1] §17.13.5.10" |
| **customXmlMoveToRangeStart** (Custom XML Markup Move Destination Location Start) | "[ISO/IEC-29500-1] §17.13.5.11" |
| **d** (Delimiter Object) | "[ISO/IEC-29500-1] §22.1.2.24" |
| **del** (Deleted Run Content) | "[ISO/IEC-29500-1] §17.13.5.14" |
| **eqArr** (Array Object) | "[ISO/IEC-29500-1] §22.1.2.34" |
| **f** (Fraction Object) | "[ISO/IEC-29500-1] §22.1.2.36" |
| **fldData** (Custom Field Data) | "[\[ISO/IEC-29500-4\]](https://go.microsoft.com/fwlink/?LinkId=150884) §14.9.6" |
| **fldSimple** (Ruby Simple Field) | §3.1.3.1.2, fldSimple |
| **func** (Function Apply Object) | "[ISO/IEC-29500-1] §22.1.2.39" |
| **groupChr** (Group-Character Object) | "[ISO/IEC-29500-1] §22.1.2.41" |
| **hyperlink** (Ruby Hyperlink) | §3.1.3.1.3, hyperlink |
| **ins** (Inserted Run Content) | "[ISO/IEC-29500-1] §17.13.5.18" |
| **limLow** (Lower-Limit Object) | "[ISO/IEC-29500-1] §22.1.2.54" |
| **limUpp** (Upper-Limit Object) | "[ISO/IEC-29500-1] §22.1.2.56" |
| **m** (Matrix Object) | "[ISO/IEC-29500-1] §22.1.2.60" |
| **moveFrom** (Move Source Run Content) | "[ISO/IEC-29500-1] §17.13.5.22" |
| **moveFromRangeEnd** (Move Source Location Container - End) | "[ISO/IEC-29500-1] §17.13.5.23" |
| **moveFromRangeStart** (Move Source Location Container - Start) | "[ISO/IEC-29500-1] §17.13.5.24" |
| **moveTo** (Move Destination Run Content) | "[ISO/IEC-29500-1] §17.13.5.25" |
| **moveToRangeEnd** (Move Destination Location Container - End) | "[ISO/IEC-29500-1] §17.13.5.27" |
| **moveToRangeStart** (Move Destination Location Container - Start) | "[ISO/IEC-29500-1] §17.13.5.28" |
| **nary** (n-ary Operator Object) | "[ISO/IEC-29500-1] §22.1.2.70" |
| **oMath** (Office Math) | "[ISO/IEC-29500-1] §22.1.2.77" |
| **oMathPara** (Office Math Paragraph) | "[ISO/IEC-29500-1] §22.1.2.78" |
| **permEnd** (Range Permission End) | "[ISO/IEC-29500-1] §17.13.7.1" |
| **permStart** (Range Permission Start) | "[ISO/IEC-29500-1] §17.13.7.2" |
| **phant** (Phantom Object) | "[ISO/IEC-29500-1] §22.1.2.81" |
| **proofErr** (Proofing Error Anchor) | "[ISO/IEC-29500-1] §17.13.8.1" |
| **r** (Run) | "[ISO/IEC-29500-1] §22.1.2.87" |
| **r** (Text Run) | "[ISO/IEC-29500-1] §17.3.2.25" |
| **rad** (Radical Object) | "[ISO/IEC-29500-1] §22.1.2.88" |
| **sdt** (Ruby Inline-Level Structured Document Tag) | §[3.1.3.1.6, sdt](808b32d8-ad64-4c84-9fb5-85ad68be54b9) |
| **sPre** (Pre-Sub-Superscript Object) | "[ISO/IEC-29500-1] §22.1.2.99" |
| **sSub** (Subscript Object) | "[ISO/IEC-29500-1] §22.1.2.101" |
| **sSubSup** (Sub-Superscript Object) | "[ISO/IEC-29500-1] §22.1.2.103" |
| **sSup** (Superscript Object) | "[ISO/IEC-29500-1] §22.1.2.105" |

| Attributes | Description |
| --- | --- |
| **dirty** (Field Result Invalidated) | Specifies that this field has been flagged by an application to indicate that its current results are invalid (stale) due to other modifications made to the document, and these contents should be updated before they are displayed if this functionality is supported by the next processing application.<br><br>[Rationale: This functionality allows applications with limited subsets of the full functionality of ISO/IEC-29500 Office Open XML File Formats [ISO/IEC-29500-1] to process documents without needing to understand and update all fields based on the semantics for their field codes.<br><br>For example, an application can add a new paragraph and flag the table of contents as dirty, without needing to understand anything about how to recalculate that field's content. end rationale]<br><br>If this attribute is omitted, then its value shall be assumed to be *false*.<br><br>[Example: Consider the following WordprocessingML for a simple field:<br><br>    - ```<br> <w:fldSimple   w:instr="AUTHOR" w:dirty="true"/><br>  <br>```<br><br><br>The **dirty** attribute value of *true* specifies that the contents of this field are no longer current based on the contents of the document, and should be recalculated whenever an application with this functionality reads the document. end example]<br><br>The possible values for this attribute are defined by the ST\_OnOff simple type (§[3.1.3.3.6, ST_OnOff](79cbec69-8430-479d-88c0-56dd44369074)). |
| **fldLock** (Field Should Not be Recalculated) | Specifies that the parent field shall not have its field result recalculated, even if an application attempts to recalculate the results of all fields in the document or a recalculation is explicitly requested.<br><br>If this attribute is omitted, then its value shall be assumed to be *false*.<br><br>[Example: Consider the following WordprocessingML for a simple field:<br><br>    - ```<br> <w:fldSimple   w:instr="AUTHOR" w:fldLock="true"><br>     <w:r><br>       <w:t>Rex Jaeschke</w:t><br>     </w:r><br> </w:fldSimple><br>```<br><br><br>The **fldLock** attribute value of *true* specifies that the contents of this field shall remain *Rex Jaeschke* regardless of the actual result of the current field codes. end example]<br><br>The possible values for this attribute are defined by the ST\_OnOff simple type (§3.1.3.3.6, ST\_OnOff). |
| **instr** (Field Codes) | Specifies the field codes for the simple field. The possible field codes are defined in "[ISO/IEC-29500-1] §17.16.5".<br><br>[Example: Consider the following WordprocessingML for a simple field:<br><br>    - ```<br> <w:fldSimple   w:instr="AUTHOR" w:fldLock="true"><br>     <w:r><br>       <w:t>Rex Jaeschke</w:t><br>     </w:r><br> </w:fldSimple><br>```<br><br><br>The **instr** attribute specifies the field codes for this simple field to be *AUTHOR*. end example]<br><br>The possible values for this attribute are defined by the ST\_String simple type (§[3.1.3.3.8, ST_String](ed68652a-6933-4080-ac59-a443946fa732)). |

The following XML Schema fragment defines the contents of this element:

    - ```
 <complexType name="CT_SimpleFieldRuby">
   <sequence>
     <element name="fldData" type="CT_Text" minOccurs="0" maxOccurs="1"/>
     <group ref="EG_RubyContent" minOccurs="0" maxOccurs="unbounded"/>
   </sequence>
   <attribute name="instr" type="ST_String" use="required"/>
   <attribute name="fldLock" type="ST_OnOff"/>
   <attribute name="dirty" type="ST_OnOff"/>
 </complexType>
```