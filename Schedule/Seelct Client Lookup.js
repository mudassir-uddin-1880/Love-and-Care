if (fields["Select_Client_Name"].value != "" && fields["Select_Client_Name"].value != null) {
    fields["Client_Master_ID"].value = data.fields["ID"].value;
    fields["Client_Phone_Number"].value = data.fields["Phone_Number"].value;
    fields["Clients_Gender"].value = data.fields["Gender"].value;
    fields["Client_Name"].value = data.fields["Client_Full_Name"].value;
    fields["Client_ID"].value = data.fields["JobCode_Id"].value;

} else {
    fields["Client_Master_ID"].value = "";
    fields["Client_Phone_Number"].value = "";
    fields["Clients_Gender"].value = "";
    fields["Client_Name"].value = "";
    fields["Client_ID"].value = 0;
}
