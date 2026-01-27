'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Database } from '@/types/database'

type Person = Database['public']['Tables']['people']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface PersonWithStats extends Person {
  file_count?: number
  project_count?: number
}

interface ProjectWithStats extends Project {
  file_count?: number
  member_count?: number
}

type Tab = 'people' | 'projects'

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState<Tab>('people')
  const [people, setPeople] = useState<PersonWithStats[]>([])
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [peopleRes, projectsRes] = await Promise.all([
        fetch('/api/people?includeStats=true'),
        fetch('/api/projects?includeStats=true'),
      ])

      if (peopleRes.ok) {
        const data = await peopleRes.json()
        setPeople(data.people || [])
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json()
        setProjects(data.projects || [])
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#111', marginBottom: '8px' }}>
          Organization
        </h1>
        <p style={{ fontSize: '14px', color: '#666' }}>
          Manage people and projects for intelligent file organization
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid #e5e5e5' }}>
        <TabButton active={activeTab === 'people'} onClick={() => setActiveTab('people')}>
          People ({people.length})
        </TabButton>
        <TabButton active={activeTab === 'projects'} onClick={() => setActiveTab('projects')}>
          Projects ({projects.length})
        </TabButton>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          Loading...
        </div>
      ) : (
        <>
          {activeTab === 'people' && (
            <PeopleTab
              people={people}
              onAdd={() => setShowAddModal(true)}
              onRefresh={fetchData}
            />
          )}
          {activeTab === 'projects' && (
            <ProjectsTab
              projects={projects}
              onAdd={() => setShowAddModal(true)}
              onRefresh={fetchData}
            />
          )}
        </>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddModal
          type={activeTab === 'people' ? 'person' : 'project'}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: active ? '500' : '400',
        color: active ? '#111' : '#666',
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid #111' : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: '-1px',
      }}
    >
      {children}
    </button>
  )
}

function PeopleTab({
  people,
  onAdd,
  onRefresh,
}: {
  people: PersonWithStats[]
  onAdd: () => void
  onRefresh: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this person?')) return

    try {
      await fetch(`/api/people/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  const relationshipColors: Record<string, string> = {
    client: '#059669',
    vendor: '#7c3aed',
    collaborator: '#2563eb',
    personal: '#dc2626',
    contact: '#6b7280',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', color: '#666' }}>
          People are automatically detected in your files and linked for smart organization.
        </p>
        <button
          onClick={onAdd}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: '500',
            color: '#fff',
            background: '#111',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Add Person
        </button>
      </div>

      {people.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', background: '#fafafa', borderRadius: '8px' }}>
          <p style={{ marginBottom: '16px' }}>No people added yet.</p>
          <button
            onClick={onAdd}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              color: '#111',
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Add your first person
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {people.map((person) => (
            <div
              key={person.id}
              style={{
                padding: '16px 20px',
                background: '#fff',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: '500',
                  color: '#374151',
                }}
              >
                {person.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '500', color: '#111' }}>
                    {person.name}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: `${relationshipColors[person.relationship] || '#6b7280'}15`,
                      color: relationshipColors[person.relationship] || '#6b7280',
                      textTransform: 'capitalize',
                    }}
                  >
                    {person.relationship}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  {person.company && <span>{person.company}</span>}
                  {person.company && person.email && <span> · </span>}
                  {person.email && <span>{person.email}</span>}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#666' }}>
                <div>
                  <span style={{ fontWeight: '500', color: '#111' }}>{person.file_count || 0}</span> files
                </div>
                <div>
                  <span style={{ fontWeight: '500', color: '#111' }}>{person.project_count || 0}</span> projects
                </div>
              </div>

              {/* Actions */}
              <button
                onClick={() => handleDelete(person.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  color: '#666',
                  background: 'none',
                  border: '1px solid #e5e5e5',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectsTab({
  projects,
  onAdd,
  onRefresh,
}: {
  projects: ProjectWithStats[]
  onAdd: () => void
  onRefresh: () => void
}) {
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this project?')) return

    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      onRefresh()
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  const statusColors: Record<string, string> = {
    active: '#059669',
    completed: '#2563eb',
    archived: '#6b7280',
    on_hold: '#d97706',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', color: '#666' }}>
          Projects help organize files by work context. Files mentioning project keywords are auto-linked.
        </p>
        <button
          onClick={onAdd}
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: '500',
            color: '#fff',
            background: '#111',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Add Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#666', background: '#fafafa', borderRadius: '8px' }}>
          <p style={{ marginBottom: '16px' }}>No projects added yet.</p>
          <button
            onClick={onAdd}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              color: '#111',
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Add your first project
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                padding: '16px 20px',
                background: '#fff',
                border: '1px solid #e5e5e5',
                borderRadius: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: '#111' }}>
                      {project.name}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: `${statusColors[project.status] || '#6b7280'}15`,
                        color: statusColors[project.status] || '#6b7280',
                        textTransform: 'capitalize',
                      }}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                  {project.description && (
                    <p style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                      {project.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleDelete(project.id)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#666',
                      background: 'none',
                      border: '1px solid #e5e5e5',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', fontSize: '13px', color: '#666' }}>
                <div>
                  <span style={{ fontWeight: '500', color: '#111' }}>{project.file_count || 0}</span> files
                </div>
                <div>
                  <span style={{ fontWeight: '500', color: '#111' }}>{project.member_count || 0}</span> members
                </div>
                {project.base_folder_path && (
                  <div>
                    Folder: <span style={{ fontWeight: '500', color: '#111' }}>{project.base_folder_path}</span>
                  </div>
                )}
              </div>

              {project.keywords && project.keywords.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {project.keywords.slice(0, 8).map((keyword, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: '#f3f4f6',
                        color: '#666',
                      }}
                    >
                      {keyword}
                    </span>
                  ))}
                  {project.keywords.length > 8 && (
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      +{project.keywords.length - 8} more
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddModal({
  type,
  onClose,
  onSuccess,
}: {
  type: 'person' | 'project'
  onClose: () => void
  onSuccess: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [relationship, setRelationship] = useState('contact')
  const [description, setDescription] = useState('')
  const [keywords, setKeywords] = useState('')
  const [baseFolderPath, setBaseFolderPath] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    try {
      const endpoint = type === 'person' ? '/api/people' : '/api/projects'
      const body =
        type === 'person'
          ? { name, email: email || null, company: company || null, relationship }
          : {
              name,
              description: description || null,
              keywords: keywords
                .split(',')
                .map((k) => k.trim())
                .filter(Boolean),
              baseFolderPath: baseFolderPath || null,
            }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create')
      }
    } catch (error) {
      console.error('Create failed:', error)
      alert('Failed to create')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
          Add {type === 'person' ? 'Person' : 'Project'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '14px',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                outline: 'none',
              }}
              placeholder={type === 'person' ? 'John Doe' : 'Project name'}
              autoFocus
            />
          </div>

          {type === 'person' ? (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    outline: 'none',
                  }}
                  placeholder="john@example.com"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
                  Company
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    outline: 'none',
                  }}
                  placeholder="Company name"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
                  Relationship
                </label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    outline: 'none',
                    background: '#fff',
                  }}
                >
                  <option value="contact">Contact</option>
                  <option value="client">Client</option>
                  <option value="vendor">Vendor</option>
                  <option value="collaborator">Collaborator</option>
                  <option value="personal">Personal</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    outline: 'none',
                    minHeight: '80px',
                    resize: 'vertical',
                  }}
                  placeholder="Brief description of the project"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    outline: 'none',
                  }}
                  placeholder="keyword1, keyword2, keyword3"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#333' }}>
                  Base Folder Path
                </label>
                <input
                  type="text"
                  value={baseFolderPath}
                  onChange={(e) => setBaseFolderPath(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid #e5e5e5',
                    borderRadius: '6px',
                    outline: 'none',
                  }}
                  placeholder="Business/Projects/MyProject"
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                color: '#666',
                background: '#fff',
                border: '1px solid #e5e5e5',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              style={{
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#fff',
                background: loading || !name.trim() ? '#ccc' : '#111',
                border: 'none',
                borderRadius: '6px',
                cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
