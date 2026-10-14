#pragma once
#include "project_reader.h"
namespace moon {class Document;}
namespace moon::project {
struct EncodedProject {std::shared_ptr<const Bytes> bytes;std::string projectId;};
// Generates a schema-21 container in memory. No file I/O, history or save-point mutations.
EncodedProject encodeEditableProject(const Document& document,Limits limits={});
// legacy recovery-service: no preview, ZIP compression level 1.
EncodedProject encodeRecoveryProject(const Document& document,Limits limits={});
}
