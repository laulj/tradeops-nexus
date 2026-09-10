import React, { useState } from "react"
import { Button, Flex, message, Upload } from "antd"
import type { GetProp, UploadFile, UploadProps } from "antd"
import { UploadIcon } from "@/components/icons/nexus"
import { Panel } from "@/components/ui"
import { baseUrl } from "@/api/backend"

type FileType = Parameters<GetProp<UploadProps, "beforeUpload">>[0]

const MyCustomUpload: React.FC = () => {
    const [fileList, setFileList] = useState<UploadFile[]>([])
    const [uploading, setUploading] = useState(false)

    const handleUpload = () => {
        const formData = new FormData()
        fileList.forEach((file) => {
            formData.append("files[]", file as FileType)
        })
        setUploading(true)
        const token = localStorage.getItem("accessToken")
        fetch(baseUrl + "data/upload", {
            headers: { "Content-type": "application/octet-stream", Authorization: `Bearer ${token}` },
            method: "POST",
            body: formData,
        })
            .then((res) => res.json())
            .then(() => {
                setFileList([])
                message.success("upload successfully.")
            })
            .catch(() => {
                message.error("upload failed.")
            })
            .finally(() => {
                setUploading(false)
            })
    }

    const props: UploadProps = {
        accept: ".db",

        onRemove: (file) => {
            const index = fileList.indexOf(file)
            const newFileList = fileList.slice()
            newFileList.splice(index, 1)
            setFileList(newFileList)
        },
        beforeUpload: (file) => {
            setFileList([...fileList, file])

            return false
        },
        fileList,
    }

    return (
        <Panel label="Database upload">
            <Flex gap="large" wrap="wrap" align="center">
                <Upload {...props}>
                    <Button icon={<UploadIcon size={14} />}>Select file</Button>
                </Upload>
                <Button type="primary" onClick={handleUpload} disabled={fileList.length === 0} loading={uploading}>
                    {uploading ? "Uploading" : "Start upload"}
                </Button>
            </Flex>
        </Panel>
    )
}

export default MyCustomUpload
