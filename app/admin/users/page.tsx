"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/contexts/AuthContext";
import { BLOOD_TYPES } from "@/lib/bloodCompatibility";

type UserRole = "donor" | "recipient" | "admin";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  bloodType: string;
  totalDonations: number;
  isAvailable: boolean;
  disabled: boolean;
  createdAt: string | null;
}

interface UserForm {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  bloodType: string;
}

const emptyForm: UserForm = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "donor",
  bloodType: "",
};

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [bloodFilter, setBloodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  const [form, setForm] = useState<UserForm>(emptyForm);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* -------------------------------------------------------
     API helper
  ------------------------------------------------------- */
  async function apiRequest(
    url: string,
    options: RequestInit = {}
  ) {
    if (!user) {
      throw new Error("You are not logged in.");
    }

    const token = await user.getIdToken();

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Something went wrong.");
    }

    return data;
  }

  /* -------------------------------------------------------
     Load users
  ------------------------------------------------------- */
  async function loadUsers() {
    if (!user) return;

    try {
      setLoading(true);
      setError("");

      const data = await apiRequest("/api/admin/users");

      setUsers(data.users || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && user) {
      loadUsers();
    }
  }, [authLoading, user]);

  /* -------------------------------------------------------
     Filter users
  ------------------------------------------------------- */
  const filteredUsers = useMemo(() => {
    const query = search.toLowerCase().trim();

    return users.filter((item) => {
      const matchesSearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query);

      const matchesRole =
        roleFilter === "all" || item.role === roleFilter;

      const matchesBlood =
        bloodFilter === "all" || item.bloodType === bloodFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !item.disabled) ||
        (statusFilter === "disabled" && item.disabled);

      return (
        matchesSearch &&
        matchesRole &&
        matchesBlood &&
        matchesStatus
      );
    });
  }, [users, search, roleFilter, bloodFilter, statusFilter]);

  /* -------------------------------------------------------
     Open Add form
  ------------------------------------------------------- */
  function openAddForm() {
    setEditingUser(null);
    setForm(emptyForm);
    setError("");
    setSuccess("");
    setShowForm(true);
  }

  /* -------------------------------------------------------
     Open Edit form
  ------------------------------------------------------- */
  function openEditForm(item: AdminUser) {
    setEditingUser(item);

    setForm({
      name: item.name,
      email: item.email,
      password: "",
      phone: item.phone,
      role: item.role,
      bloodType: item.bloodType,
    });

    setError("");
    setSuccess("");
    setShowForm(true);
  }

  /* -------------------------------------------------------
     Close form
  ------------------------------------------------------- */
  function closeForm() {
    if (saving) return;

    setShowForm(false);
    setEditingUser(null);
    setForm(emptyForm);
  }

  /* -------------------------------------------------------
     Form field update
  ------------------------------------------------------- */
  function updateForm(
    field: keyof UserForm,
    value: string
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  /* -------------------------------------------------------
     Add / Edit submit
  ------------------------------------------------------- */
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!editingUser && form.password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    try {
      setSaving(true);

      if (editingUser) {
        await apiRequest("/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({
            uid: editingUser.id,
            name: form.name,
            email: form.email,
            password: form.password || undefined,
            phone: form.phone,
            role: form.role,
            bloodType: form.bloodType,
          }),
        });

        setSuccess("User updated successfully.");
      } else {
        await apiRequest("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            phone: form.phone,
            role: form.role,
            bloodType: form.bloodType,
          }),
        });

        setSuccess("User created successfully.");
      }

      setShowForm(false);
      setEditingUser(null);
      setForm(emptyForm);

      await loadUsers();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to save user.");
    } finally {
      setSaving(false);
    }
  }

  /* -------------------------------------------------------
     Enable / Disable
  ------------------------------------------------------- */
  async function toggleDisabled(item: AdminUser) {
    if (item.id === user?.uid) {
      setError("You cannot disable your own admin account.");
      return;
    }

    try {
      setError("");
      setSuccess("");

      await apiRequest("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          uid: item.id,
          disabled: !item.disabled,
        }),
      });

      setSuccess(
        item.disabled
          ? "User enabled successfully."
          : "User disabled successfully."
      );

      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to update user status.");
    }
  }

  /* -------------------------------------------------------
     Delete user
  ------------------------------------------------------- */
  async function deleteUser(item: AdminUser) {
    if (item.id === user?.uid) {
      setError("You cannot delete your own admin account.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete ${item.name || item.email}?`
    );

    if (!confirmed) return;

    try {
      setDeleting(item.id);
      setError("");
      setSuccess("");

      await apiRequest("/api/admin/users", {
        method: "DELETE",
        body: JSON.stringify({
          uid: item.id,
        }),
      });

      setSuccess("User deleted successfully.");

      await loadUsers();
    } catch (err: any) {
      setError(err.message || "Failed to delete user.");
    } finally {
      setDeleting(null);
    }
  }

  /* -------------------------------------------------------
     Loading
  ------------------------------------------------------- */
  if (authLoading || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-pink-600" />
          <p className="text-sm text-gray-500">
            Loading users...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* --------------------------------------------------
          Header
      -------------------------------------------------- */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            User Management
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Add, edit, disable and delete BloodConnect users.
          </p>
        </div>

        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-700"
        >
          + Add User
        </button>
      </div>

      {/* --------------------------------------------------
          Messages
      -------------------------------------------------- */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* --------------------------------------------------
          Filters
      -------------------------------------------------- */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            type="text"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
          />

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-pink-500"
          >
            <option value="all">All Roles</option>
            <option value="donor">Donor</option>
            <option value="recipient">Recipient</option>
            <option value="admin">Admin</option>
          </select>

          <select
            value={bloodFilter}
            onChange={(e) => setBloodFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-pink-500"
          >
            <option value="all">All Blood Types</option>

            {BLOOD_TYPES.map((bloodType: string) => (
              <option key={bloodType} value={bloodType}>
                {bloodType}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-pink-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>

      {/* --------------------------------------------------
          Statistics
      -------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="Total Users"
          value={users.length}
        />

        <StatCard
          title="Donors"
          value={users.filter((u) => u.role === "donor").length}
        />

        <StatCard
          title="Recipients"
          value={
            users.filter((u) => u.role === "recipient").length
          }
        />

        <StatCard
          title="Admins"
          value={users.filter((u) => u.role === "admin").length}
        />
      </div>

      {/* --------------------------------------------------
          User table
      -------------------------------------------------- */}
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div>
            <h2 className="font-semibold text-gray-900">
              Users
            </h2>

            <p className="text-sm text-gray-500">
              Showing {filteredUsers.length} of {users.length} users
            </p>
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-gray-700">
              No users found
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Try changing your search or filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">
                    User
                  </th>

                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Contact
                  </th>

                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Role
                  </th>

                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Blood Type
                  </th>

                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Donations
                  </th>

                  <th className="px-4 py-3 font-semibold text-gray-600">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right font-semibold text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredUsers.map((item) => {
                  const isCurrentAdmin = item.id === user?.uid;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50"
                    >
                      {/* User */}
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-100 font-semibold text-pink-700">
                            {item.name
                              ? item.name.charAt(0).toUpperCase()
                              : "U"}
                          </div>

                          <div>
                            <p className="font-medium text-gray-900">
                              {item.name || "Unnamed User"}
                            </p>

                            <p className="max-w-[180px] truncate text-xs text-gray-500">
                              {item.id}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-4">
                        <p className="text-gray-900">
                          {item.email || "—"}
                        </p>

                        <p className="text-xs text-gray-500">
                          {item.phone || "No phone"}
                        </p>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-4">
                        <RoleBadge role={item.role} />
                      </td>

                      {/* Blood */}
                      <td className="px-4 py-4">
                        {item.bloodType ? (
                          <span className="rounded-full bg-red-50 px-3 py-1 font-semibold text-red-700">
                            {item.bloodType}
                          </span>
                        ) : (
                          <span className="text-gray-400">
                            —
                          </span>
                        )}
                      </td>

                      {/* Donations */}
                      <td className="px-4 py-4">
                        {item.role === "donor"
                          ? item.totalDonations
                          : "—"}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4">
                        {item.disabled ? (
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                            Disabled
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                            Active
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              openEditForm(item)
                            }
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>

                          {!isCurrentAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleDisabled(item)
                                }
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                {item.disabled
                                  ? "Enable"
                                  : "Disable"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  deleting === item.id
                                }
                                onClick={() =>
                                  deleteUser(item)
                                }
                                className="rounded-md bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                {deleting === item.id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --------------------------------------------------
          Add/Edit modal
      -------------------------------------------------- */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingUser
                    ? "Edit User"
                    : "Add New User"}
                </h2>

                <p className="mt-1 text-xs text-gray-500">
                  {editingUser
                    ? "Update this user's account information."
                    : "Create a new BloodConnect account."}
                </p>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="text-2xl text-gray-400 hover:text-gray-700"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 p-6"
            >
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Name
                </label>

                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    updateForm("name", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  placeholder="Enter full name"
                />
              </div>

              {/* Email */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>

                <input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    updateForm("email", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  placeholder="user@example.com"
                />
              </div>

              {/* Password */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Password
                  {editingUser && (
                    <span className="ml-1 text-xs font-normal text-gray-400">
                      (leave empty to keep current password)
                    </span>
                  )}
                </label>

                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    updateForm(
                      "password",
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  placeholder={
                    editingUser
                      ? "New password"
                      : "Minimum 6 characters"
                  }
                />
              </div>

              {/* Phone */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Phone
                </label>

                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) =>
                    updateForm("phone", e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500"
                  placeholder="Phone number"
                />
              </div>

              {/* Role */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Role
                </label>

                <select
                  value={form.role}
                  onChange={(e) =>
                    updateForm(
                      "role",
                      e.target.value as UserRole
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-pink-500"
                >
                  <option value="donor">Donor</option>
                  <option value="recipient">
                    Recipient
                  </option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {/* Blood Type */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Blood Type
                </label>

                <select
                  value={form.bloodType}
                  onChange={(e) =>
                    updateForm(
                      "bloodType",
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-pink-500"
                >
                  <option value="">
                    Select blood type
                  </option>

                  {BLOOD_TYPES.map(
                    (bloodType: string) => (
                      <option
                        key={bloodType}
                        value={bloodType}
                      >
                        {bloodType}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3 border-t pt-4">
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-pink-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingUser
                      ? "Save Changes"
                      : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Small components
------------------------------------------------------- */

function StatCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>

      <p className="mt-1 text-2xl font-bold text-gray-900">
        {value}
      </p>
    </div>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  const styles: Record<UserRole, string> = {
    donor: "bg-green-50 text-green-700",
    recipient: "bg-blue-50 text-blue-700",
    admin: "bg-purple-50 text-purple-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${styles[role]}`}
    >
      {role}
    </span>
  );
}