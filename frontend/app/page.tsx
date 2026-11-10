
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

const API_URL = "http://127.0.0.1:8000";

type HostedZone = {
  id: string;
  name: string;
  type: string;
  records: number;
  description: string;
};

type DNSRecord = {
  id: number;
  name: string;
  record_type: string;
  value: string;
  ttl: number;
  hosted_zone_id: number;
};

const recordTypes = [
  "A", "AAAA", "CNAME", "TXT", "MX",
  "NS", "PTR", "SRV", "CAA"
];

const navigation = [
  {
    heading: "Route 53",
    items: ["Dashboard", "Hosted zones", "Health checks"],
  },
  {
    heading: "Traffic management",
    items: ["Traffic policies", "Traffic flow"],
  },
  {
    heading: "Resolver",
    items: ["Overview", "Inbound endpoints", "Outbound endpoints", "Rules"],
  },
  {
    heading: "Application recovery",
    items: ["Recovery control config", "Recovery readiness"],
  },
  {
    heading: "Global DNS",
    items: ["Profiles"],
  },
];

export default function Home() {
  const [zones, setZones] = useState<HostedZone[]>([]);
  const [records, setRecords] = useState<DNSRecord[]>([]);

  const [search, setSearch] = useState("");
  const [recordSearch, setRecordSearch] = useState("");

  const [activeNav, setActiveNav] = useState("Hosted zones");
  const [selectedZone, setSelectedZone] = useState<HostedZone | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DNSRecord | null>(null);

  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [zoneType, setZoneType] = useState("Public");

  const [recordName, setRecordName] = useState("");
  const [recordType, setRecordType] = useState("A");
  const [recordValue, setRecordValue] = useState("");
  const [ttl, setTtl] = useState("300");

  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => {
      setNotice(current => current === message ? "" : current);
    }, 3000);
  }


  async function fetchZones() {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/hosted-zones`);

      if (!response.ok) {
        throw new Error("Unable to fetch hosted zones");
      }

      const data = await response.json();

      setZones(data.map((zone: any) => ({
        id: zone.zone_id,
        name: zone.name,
        type: zone.type,
        records: zone.record_count || 0,
        description: zone.comment || "No description",
      })));
    } catch (error) {
      console.error(error);
      showNotice("Unable to load hosted zones.");
    } finally {
      setLoading(false);
    }
  }


  async function fetchRecords(zone: HostedZone) {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/hosted-zones/${zone.id}/records`
      );

      if (!response.ok) {
        throw new Error("Unable to fetch DNS records");
      }

      const data = await response.json();
      setRecords(data);
    } catch (error) {
      console.error(error);
      showNotice("Unable to load DNS records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchZones();
  }, []);


  async function openZone(zone: HostedZone) {
    setSelectedZone(zone);
    setRecordSearch("");
    setActiveNav("Records");
    await fetchRecords(zone);
  }


  async function createZone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/hosted-zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: domain.trim().toLowerCase(),
          type: zoneType,
          comment: description.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to create hosted zone");
      }

      setShowModal(false);
      setDomain("");
      setDescription("");
      setZoneType("Public");

      await fetchZones();
      showNotice("Hosted zone created successfully.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Error creating zone.");
    } finally {
      setSaving(false);
    }
  }


  async function deleteZone(id: string) {
    if (!window.confirm("Delete this hosted zone and all its records?")) return;

    try {
      const response = await fetch(`${API_URL}/hosted-zones/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to delete hosted zone");
      }

      if (selectedZone?.id === id) {
        setSelectedZone(null);
        setRecords([]);
        setActiveNav("Hosted zones");
      }

      await fetchZones();
      showNotice("Hosted zone deleted successfully.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Delete failed.");
    }
  }


  function resetRecordForm() {
    setRecordName("");
    setRecordType("A");
    setRecordValue("");
    setTtl("300");
    setEditingRecord(null);
  }


  function editRecord(record: DNSRecord) {
    setEditingRecord(record);
    setRecordName(record.name);
    setRecordType(record.record_type);
    setRecordValue(record.value);
    setTtl(String(record.ttl));
    setShowModal(true);
  }


  async function saveRecord(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedZone) return;

    try {
      setSaving(true);

      const payload = {
        name: recordName.trim(),
        record_type: recordType,
        value: recordValue.trim(),
        ttl: Number(ttl),
      };

      const url = editingRecord
        ? `${API_URL}/hosted-zones/${selectedZone.id}/records/${editingRecord.id}`
        : `${API_URL}/hosted-zones/${selectedZone.id}/records`;

      const response = await fetch(url, {
        method: editingRecord ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to save DNS record");
      }

      setShowModal(false);
      resetRecordForm();

      await fetchRecords(selectedZone);

      showNotice(
        editingRecord
          ? "DNS record updated successfully."
          : "DNS record created successfully."
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Error saving record.");
    } finally {
      setSaving(false);
    }
  }


  async function deleteRecord(recordId: number) {
    if (!selectedZone) return;

    if (!window.confirm("Are you sure you want to delete this DNS record?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/hosted-zones/${selectedZone.id}/records/${recordId}`,
        { method: "DELETE" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to delete record");
      }

      await fetchRecords(selectedZone);
      showNotice("DNS record deleted successfully.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Delete failed.");
    }
  }


  async function exportRecords() {
    if (!selectedZone) return;

    try {
      const response = await fetch(
        `${API_URL}/hosted-zones/${selectedZone.id}/export`
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || "Unable to export DNS records");
      }

      const bindContent = await response.text();
      const file = new Blob([bindContent], { type: "text/plain;charset=utf-8" });
      const downloadUrl = window.URL.createObjectURL(file);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = `${selectedZone.name.replace(/\.$/, "")}.zone`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      showNotice("BIND zone file exported successfully.");
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Export failed.");
    }
  }

  async function importRecords(file: File) {
    if (!selectedZone) return;

    const extension = file.name.toLowerCase();
    if (!extension.endsWith(".zone") && !extension.endsWith(".txt")) {
      showNotice("Please select a .zone or .txt file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImporting(true);

      const response = await fetch(
        `${API_URL}/hosted-zones/${selectedZone.id}/import`,
        {
          method: "POST",
          body: formData
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Unable to import BIND file");
      }

      await fetchRecords(selectedZone);
      await fetchZones();

      showNotice(
        `Import complete: ${data.imported} imported, ${data.skipped} skipped.`
      );
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }


  const filteredZones = useMemo(() => {
    return zones.filter(zone =>
      `${zone.name} ${zone.id} ${zone.type}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [zones, search]);


  const filteredRecords = useMemo(() => {
    return records.filter(record =>
      `${record.name} ${record.record_type} ${record.value}`
        .toLowerCase()
        .includes(recordSearch.toLowerCase())
    );
  }, [records, recordSearch]);

  const isHostedZones = activeNav === "Hosted zones";
  const isRecords = activeNav === "Records";

  return (
    <div className="aws-console">


      <header className="topbar">
        <div className="top-left">
          <button className="menu-button">☰</button>
          <div className="aws-logo">aws</div>
          <div className="top-divider" />
          <span className="service-name">Route 53</span>
        </div>

        <div className="top-search">
          <span>⌕</span>
          <input placeholder="Search AWS services and features" />
          <kbd>⌘ K</kbd>
        </div>

        <div className="top-actions">
          <button title="CloudShell">▣</button>
          <button title="Notifications">♧</button>
          <button title="Help">?</button>
          <button title="Settings">⚙</button>
          <div className="region">Global <span>⌄</span></div>

          <div className="account">
            <span>R</span>
            <div>
              <strong>Route53 User</strong>
              <small>Mock Account</small>
            </div>
            <span>⌄</span>
          </div>
        </div>
      </header>


      <div className="service-bar">
        <span className="service-breadcrumb">Services</span>
        <span>›</span>
        <span>Networking & Content Delivery</span>
        <span>›</span>
        <strong>Route 53</strong>
      </div>

      <div className="workspace">


        <aside className="sidebar">
          <div className="sidebar-title">
            <strong>Amazon Route 53</strong>
            <button>‹</button>
          </div>

          <div className="sidebar-scroll">
            {navigation.map(group => (
              <div className="nav-group" key={group.heading}>
                <div className="nav-heading">{group.heading}</div>

                {group.items.map(item => (
                  <button
                    key={item}
                    onClick={() => {
                      setActiveNav(item);
                      if (item === "Hosted zones") {
                        setSelectedZone(null);
                        fetchZones();
                      }
                    }}
                    className={`nav-item ${activeNav === item ? "active" : ""}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <span>© 2026 Amazon Web Services</span>
            <span>Privacy · Terms</span>
          </div>
        </aside>


        <main className="main-content">

          <div className="breadcrumb">
            <a onClick={() => {
              setSelectedZone(null);
              setActiveNav("Hosted zones");
            }}>
              Route 53
            </a>
            <span>›</span>
            <span>{isRecords ? "Hosted zones / Records" : activeNav}</span>
          </div>


          {isHostedZones && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Hosted zones</h1>
                  <p>
                    A hosted zone is a container for records that define how
                    you want to route traffic for a domain.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={() => {
                    resetRecordForm();
                    setShowModal(true);
                  }}
                >
                  Create hosted zone
                </button>
              </div>

              <div className="info-banner">
                <span className="info-icon">i</span>
                <div>
                  <strong>About hosted zones</strong>
                  <p>
                    Hosted zones contain DNS records for your domains.
                    Manage your public and private hosted zones here.
                  </p>
                </div>
                <button className="close-info">×</button>
              </div>

              <section className="content-card">
                <div className="card-heading">
                  <div>
                    <h2>Hosted zones ({zones.length})</h2>
                    <p>Manage your hosted zones and DNS records.</p>
                  </div>

                  <button
                    className="icon-button"
                    onClick={fetchZones}
                    disabled={loading}
                    title="Refresh"
                  >
                    ↻
                  </button>
                </div>

                <div className="table-toolbar">
                  <div className="search-box">
                    <span>⌕</span>
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search hosted zones"
                    />
                  </div>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Domain name</th>
                        <th>Hosted zone ID</th>
                        <th>Type</th>
                        <th>Record count</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={5} className="empty-state">
                            Loading...
                          </td>
                        </tr>
                      )}

                      {!loading && filteredZones.map(zone => (
                        <tr key={zone.id}>
                          <td>
                            <a
                              className="table-link"
                              href="#"
                              onClick={e => {
                                e.preventDefault();
                                openZone(zone);
                              }}
                            >
                              {zone.name}
                            </a>
                          </td>

                          <td className="zone-id">{zone.id}</td>

                          <td>
                            <span className="type-label">{zone.type}</span>
                          </td>

                          <td>{zone.records}</td>

                          <td>
                            <button
                              className="delete-button"
                              onClick={() => deleteZone(zone.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}

                      {!loading && filteredZones.length === 0 && (
                        <tr>
                          <td colSpan={5} className="empty-state">
                            No hosted zones found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-footer">
                  <span>
                    Showing {filteredZones.length} of {zones.length} hosted zones
                  </span>
                  <div>
                    <button disabled>‹</button>
                    <button className="current-page">1</button>
                    <button disabled>›</button>
                  </div>
                </div>
              </section>

              <div className="bottom-note">
                <span>ⓘ</span>
                Hosted zones are stored in SQLite.
              </div>
            </>
          )}


          {isRecords && selectedZone && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Records</h1>
                  <p>
                    Manage DNS records for {selectedZone.name}.
                  </p>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".zone,.txt,text/plain"
                    style={{ display: "none" }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void importRecords(file);
                      }
                    }}
                  />

                  <button
                    className="secondary-button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                  >
                    {importing ? "Importing..." : "Import BIND file"}
                  </button>

                  <button
                    className="secondary-button"
                    onClick={exportRecords}
                  >
                    Export BIND file
                  </button>

                  <button
                    className="primary-button"
                    onClick={() => {
                      resetRecordForm();
                      setShowModal(true);
                    }}
                  >
                    Create record
                  </button>
                </div>
              </div>

              <section className="content-card">
                <div className="card-heading">
                  <div>
                    <h2>{selectedZone.name}</h2>
                    <p>
                      Hosted zone ID: {selectedZone.id}
                    </p>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() => fetchRecords(selectedZone)}
                    disabled={loading}
                    title="Refresh records"
                  >
                    ↻
                  </button>
                </div>

                <div className="table-toolbar">
                  <div className="search-box">
                    <span>⌕</span>
                    <input
                      value={recordSearch}
                      onChange={e => setRecordSearch(e.target.value)}
                      placeholder="Search DNS records"
                    />
                  </div>
                </div>

                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Record name</th>
                        <th>Type</th>
                        <th>Value</th>
                        <th>TTL</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {loading && (
                        <tr>
                          <td colSpan={5} className="empty-state">
                            Loading records...
                          </td>
                        </tr>
                      )}

                      {!loading && filteredRecords.map(record => (
                        <tr key={record.id}>
                          <td>{record.name}</td>
                          <td>
                            <span className="type-label">
                              {record.record_type}
                            </span>
                          </td>
                          <td className="zone-id">{record.value}</td>
                          <td>{record.ttl}</td>
                          <td>
                            <button
                              className="secondary-button"
                              onClick={() => editRecord(record)}
                            >
                              Edit
                            </button>

                            {" "}

                            <button
                              className="delete-button"
                              onClick={() => deleteRecord(record.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}

                      {!loading && filteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={5} className="empty-state">
                            No DNS records found. Create your first record.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="table-footer">
                  <span>
                    Showing {filteredRecords.length} of {records.length} records
                  </span>
                </div>
              </section>

              <button
                className="secondary-button"
                onClick={() => {
                  setSelectedZone(null);
                  setActiveNav("Hosted zones");
                  fetchZones();
                }}
              >
                ← Back to hosted zones
              </button>
            </>
          )}


          {!isHostedZones && !isRecords && (
            <div className="coming-soon">
              <div className="coming-icon">⚙</div>
              <h1>{activeNav}</h1>
              <h2>Coming soon</h2>
              <p>
                This section is part of the Route 53 console.
                We&apos;ll implement it in a future phase.
              </p>
              <button
                className="secondary-button"
                onClick={() => setActiveNav("Hosted zones")}
              >
                Back to hosted zones
              </button>
            </div>
          )}

          {isRecords && !selectedZone && (
            <div className="coming-soon">
              <h1>No hosted zone selected</h1>
              <button
                className="secondary-button"
                onClick={() => setActiveNav("Hosted zones")}
              >
                Back to hosted zones
              </button>
            </div>
          )}

        </main>
      </div>


      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowModal(false);
            resetRecordForm();
          }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>
                {isRecords
                  ? editingRecord ? "Edit DNS record" : "Create DNS record"
                  : "Create hosted zone"}
              </h2>

              <button onClick={() => {
                setShowModal(false);
                resetRecordForm();
              }}>
                ×
              </button>
            </div>

            {isRecords ? (
              <form onSubmit={saveRecord}>
                <label htmlFor="recordName">Record name</label>
                <input
                  id="recordName"
                  value={recordName}
                  onChange={e => setRecordName(e.target.value)}
                  placeholder="www.example.com"
                  required
                />

                <label htmlFor="recordType">Record type</label>
                <select
                  id="recordType"
                  value={recordType}
                  onChange={e => setRecordType(e.target.value)}
                >
                  {recordTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>

                <label htmlFor="recordValue">Value</label>
                <textarea
                  id="recordValue"
                  value={recordValue}
                  onChange={e => setRecordValue(e.target.value)}
                  placeholder="Enter record value"
                  rows={3}
                  required
                />

                <label htmlFor="ttl">TTL (seconds)</label>
                <input
                  id="ttl"
                  type="number"
                  min="1"
                  value={ttl}
                  onChange={e => setTtl(e.target.value)}
                  required
                />

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setShowModal(false);
                      resetRecordForm();
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving}
                  >
                    {saving ? "Saving..." : editingRecord ? "Save changes" : "Create record"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={createZone}>
                <label htmlFor="domain">Domain name</label>
                <input
                  id="domain"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="example.com"
                  required
                />

                <label htmlFor="description">Description (optional)</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Enter a description"
                  rows={3}
                />

                <label htmlFor="zoneType">Hosted zone type</label>
                <select
                  id="zoneType"
                  value={zoneType}
                  onChange={e => setZoneType(e.target.value)}
                >
                  <option value="Public">Public hosted zone</option>
                  <option value="Private">Private hosted zone</option>
                </select>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowModal(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={saving}
                  >
                    {saving ? "Creating..." : "Create hosted zone"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}


      {notice && (
        <div className="toast">
          <span>✓</span>
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}

    </div>
  );
}
